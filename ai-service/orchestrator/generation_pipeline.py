"""
GenerationPipeline — Phase 2 Section 10, extended by Phase 3 Section 13
and Phase 4 Section 17.

Intentionally not a generic workflow engine — it's the sequence(s) the
product actually needs, written out plainly so they read top to bottom.

Three entry points, each strictly additive over the last:
- `run()` — Phase 2: Requirements -> Design -> Architecture. Unchanged;
  POST /v1/planning/portfolio depends on that.
- `run_full()` — Phase 3: the above plus Code Generation and Project
  Validation. Unchanged; POST /v1/generation/portfolio depends on that.
- `run_with_build()` — Phase 4: the above plus an actual sandboxed build,
  and a bounded debug/patch/rebuild loop when it fails. Powers the new
  POST /v1/build/portfolio.

They share `_run_planning_stages()` and `_run_generation_stage()` rather
than duplicating logic across three methods.
"""
import logging
import uuid

from agents.architecture_agent import ArchitectureAgent
from agents.base_agent import AgentError
from agents.code_generation_agent import CodeGenerationAgent
from agents.debug_agent import DebugAgent
from agents.design_agent import DesignAgent
from agents.requirements_agent import RequirementsAgent
from build.error_parser import select_affected_files
from build.validator import PreBuildValidationError, validate_and_build
from config import Settings, get_settings
from orchestrator.state import PipelineStage, PipelineState
from project.generator import build_manifest
from project.manifest import ProjectManifest
from project.patcher import PatchError, apply_patch
from project.validator import validate_project
from sandbox.base import BuildSandbox
from sandbox.factory import get_sandbox
from schemas.code_generation import GeneratedProject

logger = logging.getLogger(__name__)


class PipelineFailure(Exception):
    """Raised when any stage fails. Carries the same code/stage/message
    shape as the Section 17 error response, plus the state as it stood at
    the moment of failure (so a caller can see what *did* complete)."""

    def __init__(self, code: str, stage: str, message: str, state: PipelineState):
        super().__init__(message)
        self.code = code
        self.stage = stage
        self.message = message
        self.state = state


class GenerationPipeline:
    def __init__(
        self,
        requirements_agent: RequirementsAgent | None = None,
        design_agent: DesignAgent | None = None,
        architecture_agent: ArchitectureAgent | None = None,
        code_generation_agent: CodeGenerationAgent | None = None,
        debug_agent: DebugAgent | None = None,
        settings: Settings | None = None,
        sandbox: BuildSandbox | None = None,
    ):
        # Injectable so tests can run the real chain against a fake
        # provider/sandbox. Production code leaves these as None and gets
        # the real, configured versions.
        self._requirements_agent = requirements_agent or RequirementsAgent()
        self._design_agent = design_agent or DesignAgent()
        self._architecture_agent = architecture_agent or ArchitectureAgent()
        self._code_generation_agent = code_generation_agent or CodeGenerationAgent()
        self._debug_agent = debug_agent or DebugAgent()
        self._settings = settings or get_settings()
        self._sandbox = sandbox or get_sandbox(self._settings)

    async def run(self, input_data: dict, job_id: str | None = None) -> PipelineState:
        """Requirements -> Design -> Architecture only. Unchanged from
        Phase 2 — POST /v1/planning/portfolio's contract depends on this
        staying exactly as it was."""
        job_id = job_id or str(uuid.uuid4())
        state = PipelineState(jobId=job_id)
        logger.info("pipeline_started", extra={"jobId": job_id})

        await self._run_planning_stages(input_data, job_id, state)

        state.stage = PipelineStage.COMPLETED
        logger.info("pipeline_completed", extra={"jobId": job_id})
        return state

    async def run_full(self, input_data: dict, job_id: str | None = None) -> PipelineState:
        """Requirements -> Design -> Architecture -> Code Generation ->
        Project Validation. Unchanged from Phase 3 —
        POST /v1/generation/portfolio's contract depends on this staying
        exactly as it was."""
        job_id = job_id or str(uuid.uuid4())
        state = PipelineState(jobId=job_id)
        logger.info("generation_started", extra={"jobId": job_id})

        requirements_dict, design_dict, architecture_dict = await self._run_planning_stages(
            input_data, job_id, state
        )
        await self._run_generation_stage(requirements_dict, design_dict, architecture_dict, job_id, state)

        state.stage = PipelineStage.COMPLETED
        logger.info("generation_completed", extra={"jobId": job_id})
        return state

    async def run_with_build(self, input_data: dict, job_id: str | None = None) -> PipelineState:
        """Requirements -> Design -> Architecture -> Code Generation ->
        Project Validation -> Build -> (success | Debug -> Patch ->
        rebuild, bounded). Powers POST /v1/build/portfolio."""
        job_id = job_id or str(uuid.uuid4())
        state = PipelineState(jobId=job_id)
        logger.info("generation_started", extra={"jobId": job_id})

        requirements_dict, design_dict, architecture_dict = await self._run_planning_stages(
            input_data, job_id, state
        )
        generated, manifest = await self._run_generation_stage(
            requirements_dict, design_dict, architecture_dict, job_id, state
        )

        return await self._run_build_and_repair_loop(manifest, architecture_dict, job_id, state)

    async def _run_planning_stages(
        self, input_data: dict, job_id: str, state: PipelineState
    ) -> tuple[dict, dict, dict]:
        """Requirements -> Design -> Architecture, mutating `state` as it
        goes. Shared by every entry point so these three stages exist in
        exactly one place. Raises PipelineFailure on any stage failure."""
        state.stage = PipelineStage.ANALYZING_REQUIREMENTS
        try:
            requirements = await self._requirements_agent.run(input_data, job_id=job_id)
        except AgentError as exc:
            state.mark_failed("REQUIREMENTS", exc.code, str(exc))
            logger.error("pipeline_failed", extra={"jobId": job_id, "stage": "REQUIREMENTS", "code": exc.code})
            raise PipelineFailure(exc.code, "REQUIREMENTS", str(exc), state) from exc
        requirements_dict = requirements.model_dump(mode="json")
        state.mark_stage_complete("REQUIREMENTS", requirements_dict)

        state.stage = PipelineStage.CREATING_DESIGN
        design_context = {**input_data, "requirements": requirements_dict}
        try:
            design = await self._design_agent.run(design_context, job_id=job_id)
        except AgentError as exc:
            state.mark_failed("DESIGN", exc.code, str(exc))
            logger.error("pipeline_failed", extra={"jobId": job_id, "stage": "DESIGN", "code": exc.code})
            raise PipelineFailure(exc.code, "DESIGN", str(exc), state) from exc
        design_dict = design.model_dump(mode="json")
        state.mark_stage_complete("DESIGN", design_dict)

        state.stage = PipelineStage.CREATING_ARCHITECTURE
        architecture_context = {"requirements": requirements_dict, "design": design_dict}
        try:
            architecture = await self._architecture_agent.run(architecture_context, job_id=job_id)
        except AgentError as exc:
            state.mark_failed("ARCHITECTURE", exc.code, str(exc))
            logger.error("pipeline_failed", extra={"jobId": job_id, "stage": "ARCHITECTURE", "code": exc.code})
            raise PipelineFailure(exc.code, "ARCHITECTURE", str(exc), state) from exc
        architecture_dict = architecture.model_dump(mode="json")
        state.mark_stage_complete("ARCHITECTURE", architecture_dict)

        return requirements_dict, design_dict, architecture_dict

    async def _run_generation_stage(
        self, requirements_dict: dict, design_dict: dict, architecture_dict: dict, job_id: str, state: PipelineState
    ) -> tuple[GeneratedProject, ProjectManifest]:
        """Code Generation -> static Project Validation, mutating `state`
        as it goes. Shared by run_full() and run_with_build(). Raises
        PipelineFailure on either stage's failure."""
        state.stage = PipelineStage.GENERATING_CODE
        code_gen_context = {
            "requirements": requirements_dict,
            "design": design_dict,
            "architecture": architecture_dict,
        }
        try:
            generated = await self._code_generation_agent.run(code_gen_context, job_id=job_id)
        except AgentError as exc:
            state.mark_failed("CODE_GENERATION", exc.code, str(exc))
            logger.error(
                "generation_failed", extra={"jobId": job_id, "stage": "CODE_GENERATION", "code": exc.code}
            )
            raise PipelineFailure(exc.code, "CODE_GENERATION", str(exc), state) from exc
        state.mark_stage_complete("CODE_GENERATION", generated.model_dump(mode="json"))

        state.stage = PipelineStage.VALIDATING_PROJECT
        logger.info("project_validation_started", extra={"jobId": job_id})
        manifest = build_manifest(generated, architecture_dict)
        validation_result = validate_project(manifest, architecture_dict)
        logger.info(
            "project_validation_completed",
            extra={
                "jobId": job_id,
                "valid": validation_result.valid,
                "errorCount": len(validation_result.errors),
                "warningCount": len(validation_result.warnings),
            },
        )
        if not validation_result.valid:
            message = "; ".join(validation_result.errors)
            state.mark_failed("PROJECT_VALIDATION", "PROJECT_VALIDATION_FAILURE", message)
            logger.error("generation_failed", extra={"jobId": job_id, "stage": "PROJECT_VALIDATION"})
            raise PipelineFailure("PROJECT_VALIDATION_FAILURE", "PROJECT_VALIDATION", message, state)
        state.mark_stage_complete(
            "PROJECT_VALIDATION",
            {
                "manifest": manifest.model_dump(mode="json"),
                "validation": {"valid": True, "errors": [], "warnings": validation_result.warnings},
            },
        )
        return generated, manifest

    async def _run_build_and_repair_loop(
        self, manifest: ProjectManifest, architecture_dict: dict, job_id: str, state: PipelineState
    ) -> PipelineState:
        """Build -> (success | Debug -> Patch -> rebuild), bounded by
        settings.max_build_repair_attempts. Section 20: the sandbox build
        result is authoritative — the LLM (Debug Agent) only diagnoses and
        proposes fixes; it never decides whether its own repair worked."""
        repair_attempt = 0
        while True:
            state.stage = PipelineStage.BUILDING
            logger.info("build_started", extra={"jobId": job_id, "repairAttempt": repair_attempt})
            try:
                build_result = await validate_and_build(
                    manifest, architecture_dict, settings=self._settings, sandbox=self._sandbox
                )
            except PreBuildValidationError as exc:
                # A patch broke something static validation checks (e.g.
                # corrupted package.json) — same failure Phase 3's
                # generation stage would have raised, on the same code.
                message = str(exc)
                state.mark_failed("PROJECT_VALIDATION", "PROJECT_VALIDATION_FAILURE", message)
                logger.error(
                    "generation_build_failed",
                    extra={"jobId": job_id, "reason": "patch_broke_static_validation", "repairAttempt": repair_attempt},
                )
                raise PipelineFailure("PROJECT_VALIDATION_FAILURE", "PROJECT_VALIDATION", message, state) from exc

            state.buildResult = build_result.model_dump(mode="json")
            state.finalProject = manifest.model_dump(mode="json")

            if build_result.status == "success":
                logger.info(
                    "build_completed",
                    extra={"jobId": job_id, "repairAttempt": repair_attempt, "durationMs": build_result.durationMs},
                )
                state.mark_stage_complete("BUILD", {"buildResult": state.buildResult, "repairAttempts": repair_attempt})
                state.stage = PipelineStage.COMPLETED
                logger.info("generation_build_completed", extra={"jobId": job_id, "repairAttempts": repair_attempt})
                return state

            log_event = {"failed": "build_failed", "timeout": "build_timeout", "blocked": "build_blocked"}[
                build_result.status
            ]
            logger.warning(log_event, extra={"jobId": job_id, "repairAttempt": repair_attempt})

            if build_result.status == "blocked":
                # Not something a code patch can fix — an unsafe script was
                # never even executed. Fail immediately; don't spend a
                # repair attempt pretending the Debug Agent could help.
                message = "Build blocked: an unsafe script was detected in package.json and never executed."
                state.mark_failed("BUILD", "BUILD_BLOCKED", message)
                logger.error("generation_build_failed", extra={"jobId": job_id, "reason": "blocked"})
                raise PipelineFailure("BUILD_BLOCKED", "BUILD", message, state)

            if repair_attempt >= self._settings.max_build_repair_attempts:
                message = f"Build still failing after {repair_attempt} repair attempt(s)."
                state.mark_failed("BUILD", "BUILD_REPAIR_EXHAUSTED", message)
                logger.error(
                    "generation_build_failed",
                    extra={"jobId": job_id, "reason": "repair_exhausted", "repairAttempts": repair_attempt},
                )
                raise PipelineFailure("BUILD_REPAIR_EXHAUSTED", "BUILD", message, state)

            manifest = await self._debug_and_patch(manifest, architecture_dict, build_result, job_id, repair_attempt, state)
            repair_attempt += 1
            state.repairAttempt = repair_attempt
            # loop back to BUILDING for the rebuild

    async def _debug_and_patch(
        self, manifest: ProjectManifest, architecture_dict: dict, build_result, job_id: str, repair_attempt: int, state: PipelineState
    ) -> ProjectManifest:
        state.stage = PipelineStage.DEBUGGING
        logger.info("debug_started", extra={"jobId": job_id, "repairAttempt": repair_attempt})

        manifest_files = {f.path: f.content for f in manifest.files}
        affected_files = select_affected_files(
            manifest_files, build_result.errors, fallback_paths=list(architecture_dict.get("entryPoints", []))
        )
        debug_context = {
            "architecture": architecture_dict,
            "buildResult": state.buildResult,
            "normalizedErrors": [e.model_dump(mode="json") for e in build_result.errors],
            "affectedFiles": affected_files,
        }
        try:
            debug_result = await self._debug_agent.run(debug_context, job_id=job_id)
        except AgentError as exc:
            state.mark_failed("DEBUGGING", exc.code, str(exc))
            logger.error(
                "generation_build_failed",
                extra={"jobId": job_id, "reason": "debug_agent_failure", "code": exc.code, "repairAttempt": repair_attempt},
            )
            raise PipelineFailure(exc.code, "DEBUGGING", str(exc), state) from exc
        state.debugResult = debug_result.model_dump(mode="json")
        logger.info(
            "debug_completed",
            extra={
                "jobId": job_id,
                "repairAttempt": repair_attempt,
                "confidence": debug_result.confidence,
                "changedFiles": len(debug_result.changes),
            },
        )

        state.stage = PipelineStage.PATCHING
        logger.info("patch_started", extra={"jobId": job_id, "repairAttempt": repair_attempt})
        try:
            patched = apply_patch(manifest, debug_result)
        except PatchError as exc:
            state.mark_failed("PATCHING", "DEBUG_PATCH_INVALID", str(exc))
            logger.error(
                "generation_build_failed",
                extra={"jobId": job_id, "reason": "invalid_patch", "repairAttempt": repair_attempt},
            )
            raise PipelineFailure("DEBUG_PATCH_INVALID", "PATCHING", str(exc), state) from exc
        logger.info(
            "patch_completed",
            extra={"jobId": job_id, "repairAttempt": repair_attempt, "filesChanged": len(debug_result.changes)},
        )
        return patched
