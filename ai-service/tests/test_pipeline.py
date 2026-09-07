"""
GenerationPipeline tests — Phase 2, Section 13.

test_full_chain_end_to_end is the closest thing to spec Section 21's
"perform a real end-to-end test using the portfolio fixture" that's
possible without live network access to a real provider — see README.md's
Phase 2 section for why. It runs the actual RequirementsAgent ->
DesignAgent -> ArchitectureAgent -> GenerationPipeline code, completely
unmodified, against a scripted FakeProvider per agent. That proves the
orchestration, context-threading between stages, and state tracking are
all correct — independent of what a live Gemini call would return.
"""
import json

import pytest

from agents.architecture_agent import ArchitectureAgent
from agents.code_generation_agent import CodeGenerationAgent
from agents.debug_agent import DebugAgent
from agents.design_agent import DesignAgent
from agents.requirements_agent import RequirementsAgent
from config import Settings
from orchestrator.generation_pipeline import GenerationPipeline, PipelineFailure
from orchestrator.state import PipelineStage
from schemas.build import BuildResult
from tests.fakes import FakeProvider, FakeSandbox, fixed_response_provider
from tests.fakes import FakeProvider, fixed_response_provider


def _settings(max_schema_retries: int = 2) -> Settings:
    return Settings(max_schema_retries=max_schema_retries)


def _happy_path_pipeline(valid_requirements_payload, valid_design_payload, valid_architecture_payload):
    req_provider = fixed_response_provider(valid_requirements_payload)
    design_provider = fixed_response_provider(valid_design_payload)
    arch_provider = fixed_response_provider(valid_architecture_payload)
    pipeline = GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(), provider=req_provider),
        design_agent=DesignAgent(settings=_settings(), provider=design_provider),
        architecture_agent=ArchitectureAgent(settings=_settings(), provider=arch_provider),
    )
    return pipeline, req_provider, design_provider, arch_provider


async def test_full_chain_end_to_end(
    portfolio_input, valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    pipeline, _req_provider, design_provider, arch_provider = _happy_path_pipeline(
        valid_requirements_payload, valid_design_payload, valid_architecture_payload
    )

    state = await pipeline.run(portfolio_input, job_id="e2e-test")

    assert state.stage == PipelineStage.COMPLETED
    assert state.completedStages == ["REQUIREMENTS", "DESIGN", "ARCHITECTURE"]
    assert state.failedStages == []
    assert set(state.outputs.keys()) == {"REQUIREMENTS", "DESIGN", "ARCHITECTURE"}
    assert state.outputs["REQUIREMENTS"]["websiteType"] == "portfolio"
    assert state.outputs["ARCHITECTURE"]["project"]["framework"] == "react-vite"

    # Design must have received Requirements' actual output, not just the
    # raw pipeline input — proves context is threaded stage to stage, not
    # each agent seeing the same static payload.
    design_prompt = design_provider.calls[0]["prompt"]
    assert state.outputs["REQUIREMENTS"]["targetAudience"] in design_prompt

    # Same check for Architecture receiving both prior stages' real output.
    arch_prompt = arch_provider.calls[0]["prompt"]
    assert state.outputs["DESIGN"]["designSystem"]["theme"] in arch_prompt


async def test_failure_propagation_preserves_partial_state(valid_requirements_payload):
    req_provider = fixed_response_provider(valid_requirements_payload)
    design_provider = FakeProvider(fail_with="provider unavailable")
    arch_provider = FakeProvider()  # must never be called
    pipeline = GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(), provider=req_provider),
        design_agent=DesignAgent(settings=_settings(), provider=design_provider),
        architecture_agent=ArchitectureAgent(settings=_settings(), provider=arch_provider),
    )
    input_data = {"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}}

    with pytest.raises(PipelineFailure) as exc_info:
        await pipeline.run(input_data)

    failure = exc_info.value
    assert failure.stage == "DESIGN"
    assert failure.code == "PROVIDER_FAILURE"
    # Requirements genuinely completed before Design failed — that work isn't lost.
    assert failure.state.completedStages == ["REQUIREMENTS"]
    assert failure.state.failedStages == ["DESIGN"]
    assert failure.state.stage == PipelineStage.FAILED
    assert "REQUIREMENTS" in failure.state.outputs
    assert arch_provider.calls == []


async def test_retry_limit_is_enforced_within_the_pipeline(valid_requirements_payload):
    req_provider = fixed_response_provider(valid_requirements_payload)
    design_provider = FakeProvider(responses=["bad", "bad", "bad"])  # never valid
    arch_provider = FakeProvider()
    pipeline = GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(max_schema_retries=2), provider=req_provider),
        design_agent=DesignAgent(settings=_settings(max_schema_retries=2), provider=design_provider),
        architecture_agent=ArchitectureAgent(settings=_settings(max_schema_retries=2), provider=arch_provider),
    )
    input_data = {"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}}

    with pytest.raises(PipelineFailure) as exc_info:
        await pipeline.run(input_data)

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"
    assert len(design_provider.calls) == 3  # bounded — not infinite
    assert arch_provider.calls == []


async def test_run_never_touches_code_generation(
    portfolio_input, valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    """Regression guard: Phase 2's run() must keep its exact Phase 2
    meaning — planning only — even though GenerationPipeline now also
    owns a CodeGenerationAgent for run_full()'s sake."""
    codegen_provider = FakeProvider()  # must never be called by run()
    pipeline = GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(), provider=fixed_response_provider(valid_requirements_payload)),
        design_agent=DesignAgent(settings=_settings(), provider=fixed_response_provider(valid_design_payload)),
        architecture_agent=ArchitectureAgent(settings=_settings(), provider=fixed_response_provider(valid_architecture_payload)),
        code_generation_agent=CodeGenerationAgent(settings=_settings(), provider=codegen_provider),
    )

    state = await pipeline.run(portfolio_input)

    assert state.stage == PipelineStage.COMPLETED
    assert set(state.outputs.keys()) == {"REQUIREMENTS", "DESIGN", "ARCHITECTURE"}
    assert codegen_provider.calls == []


def _full_pipeline(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, code_gen_provider
):
    return GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(), provider=fixed_response_provider(valid_requirements_payload)),
        design_agent=DesignAgent(settings=_settings(), provider=fixed_response_provider(valid_design_payload)),
        architecture_agent=ArchitectureAgent(settings=_settings(), provider=fixed_response_provider(valid_full_architecture_payload)),
        code_generation_agent=CodeGenerationAgent(settings=_settings(), provider=code_gen_provider),
    )


async def test_full_generation_chain_end_to_end(
    portfolio_input,
    valid_requirements_payload,
    valid_design_payload,
    valid_full_architecture_payload,
    valid_code_generation_payload,
):
    """The Phase 3 equivalent of test_full_chain_end_to_end — the real
    RequirementsAgent -> DesignAgent -> ArchitectureAgent ->
    CodeGenerationAgent -> deterministic validator, unmodified, run
    against scripted fakes for every provider call."""
    pipeline = _full_pipeline(
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        fixed_response_provider(valid_code_generation_payload),
    )

    state = await pipeline.run_full(portfolio_input, job_id="full-e2e-test")

    assert state.stage == PipelineStage.COMPLETED
    assert state.completedStages == ["REQUIREMENTS", "DESIGN", "ARCHITECTURE", "CODE_GENERATION", "PROJECT_VALIDATION"]
    assert state.failedStages == []

    project_validation = state.outputs["PROJECT_VALIDATION"]
    assert project_validation["validation"]["valid"] is True
    assert project_validation["validation"]["errors"] == []
    manifest = project_validation["manifest"]
    assert manifest["project"]["framework"] == "react-vite"
    assert len(manifest["files"]) == 13
    assert any(f["path"] == "src/App.jsx" for f in manifest["files"])


async def test_generation_failure_at_code_generation_preserves_prior_stages(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload
):
    pipeline = _full_pipeline(
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        FakeProvider(fail_with="provider unavailable"),
    )
    input_data = {"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}}

    with pytest.raises(PipelineFailure) as exc_info:
        await pipeline.run_full(input_data)

    failure = exc_info.value
    assert failure.stage == "CODE_GENERATION"
    assert failure.code == "PROVIDER_FAILURE"
    assert failure.state.completedStages == ["REQUIREMENTS", "DESIGN", "ARCHITECTURE"]
    assert failure.state.failedStages == ["CODE_GENERATION"]


async def test_generation_failure_at_project_validation(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    # Schema-valid (the agent succeeds), but missing a required file — the
    # deterministic validator, not the LLM schema, must be what catches this.
    broken_codegen = {
        **valid_code_generation_payload,
        "files": [f for f in valid_code_generation_payload["files"] if f["path"] != "src/App.jsx"],
    }
    pipeline = _full_pipeline(
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        fixed_response_provider(broken_codegen),
    )
    input_data = {"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}}

    with pytest.raises(PipelineFailure) as exc_info:
        await pipeline.run_full(input_data)

    failure = exc_info.value
    assert failure.stage == "PROJECT_VALIDATION"
    assert failure.code == "PROJECT_VALIDATION_FAILURE"
    assert "src/App.jsx" in failure.message
    # Code Generation itself succeeded — only Project Validation failed.
    assert failure.state.completedStages == ["REQUIREMENTS", "DESIGN", "ARCHITECTURE", "CODE_GENERATION"]
    assert failure.state.failedStages == ["PROJECT_VALIDATION"]


# --- Phase 4: run_with_build() tests (Section 28) -----------------------
# FakeSandbox is used throughout here on purpose — these tests are about
# ORCHESTRATION (does the loop call things in the right order, is it
# bounded, does state track correctly), which a real npm/vite cycle would
# only make slower to verify, not more correct. The real sandbox mechanism
# itself is proven separately in tests/test_local_sandbox.py.


def _build_pipeline(
    valid_requirements_payload,
    valid_design_payload,
    valid_full_architecture_payload,
    valid_code_generation_payload,
    sandbox,
    debug_provider=None,
):
    return GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(), provider=fixed_response_provider(valid_requirements_payload)),
        design_agent=DesignAgent(settings=_settings(), provider=fixed_response_provider(valid_design_payload)),
        architecture_agent=ArchitectureAgent(settings=_settings(), provider=fixed_response_provider(valid_full_architecture_payload)),
        code_generation_agent=CodeGenerationAgent(settings=_settings(), provider=fixed_response_provider(valid_code_generation_payload)),
        debug_agent=DebugAgent(settings=_settings(), provider=debug_provider or FakeProvider()),
        settings=_settings(),
        sandbox=sandbox,
    )


def _success_result(**overrides) -> BuildResult:
    defaults = {"status": "success", "exitCode": 0, "stdout": "built ok", "durationMs": 1000}
    return BuildResult(**{**defaults, **overrides})


def _failed_result(**overrides) -> BuildResult:
    defaults = {"status": "failed", "exitCode": 1, "stderr": 'Could not resolve "../data/x.js" from "src/components/Hero.jsx"', "durationMs": 500}
    return BuildResult(**{**defaults, **overrides})


def _debug_fix_payload() -> dict:
    return {
        "diagnosis": "bad import",
        "rootCause": {"category": "import", "file": "src/components/Hero.jsx", "message": "x"},
        "changes": [
            {
                "path": "src/components/Hero.jsx",
                "action": "replace",
                "reason": "fix it",
                "content": "export default function Hero() { return <section>fixed</section> }",
            }
        ],
        "confidence": 0.9,
    }


async def test_build_succeeds_on_first_try(
    portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    sandbox = FakeSandbox(results=[_success_result()])
    pipeline = _build_pipeline(
        valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload, sandbox
    )

    state = await pipeline.run_with_build(portfolio_input, job_id="build-success-test")

    assert state.stage == PipelineStage.COMPLETED
    assert state.completedStages[-1] == "BUILD"
    assert state.repairAttempt == 0
    assert state.outputs["BUILD"]["repairAttempts"] == 0
    assert len(sandbox.calls) == 1


async def test_build_fails_then_debug_patch_rebuild_succeeds(
    portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    sandbox = FakeSandbox(results=[_failed_result(), _success_result()])
    debug_provider = fixed_response_provider(_debug_fix_payload())
    pipeline = _build_pipeline(
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        valid_code_generation_payload,
        sandbox,
        debug_provider=debug_provider,
    )

    state = await pipeline.run_with_build(portfolio_input, job_id="repair-success-test")

    assert state.stage == PipelineStage.COMPLETED
    assert state.repairAttempt == 1
    assert len(sandbox.calls) == 2  # initial build + one rebuild
    assert len(debug_provider.calls) == 1
    # The second (rebuilt) call must have received the PATCHED manifest,
    # not the original broken one.
    rebuilt_hero = next(f for f in sandbox.calls[1].files if f.path == "src/components/Hero.jsx")
    assert "fixed" in rebuilt_hero.content


async def test_persistent_failure_hits_max_repair_attempts(
    portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    # Fixture E: every rebuild fails, and the "fix" never actually changes
    # anything meaningful — a debug agent that's confidently wrong.
    sandbox = FakeSandbox(results=[_failed_result()] * 10)
    debug_provider = FakeProvider(responses=[json.dumps(_debug_fix_payload())] * 10)
    pipeline = _build_pipeline(
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        valid_code_generation_payload,
        sandbox,
        debug_provider=debug_provider,
    )

    with pytest.raises(PipelineFailure) as exc_info:
        await pipeline.run_with_build(portfolio_input, job_id="persistent-failure-test")

    failure = exc_info.value
    assert failure.code == "BUILD_REPAIR_EXHAUSTED"
    assert failure.stage == "BUILD"
    # initial build + MAX_BUILD_REPAIR_ATTEMPTS (default 3) rebuilds = 4 total, then stop.
    assert len(sandbox.calls) == 4
    assert failure.state.repairAttempt == 3
    assert failure.state.buildResult is not None  # Section 19: final build result preserved
    assert failure.state.debugResult is not None  # Section 19: last diagnosis preserved


async def test_blocked_build_fails_immediately_without_spending_a_repair_attempt(
    portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    sandbox = FakeSandbox(results=[BuildResult(status="blocked", stderr="unsafe script detected")])
    debug_provider = FakeProvider()  # must never be called
    pipeline = _build_pipeline(
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        valid_code_generation_payload,
        sandbox,
        debug_provider=debug_provider,
    )

    with pytest.raises(PipelineFailure) as exc_info:
        await pipeline.run_with_build(portfolio_input, job_id="blocked-test")

    failure = exc_info.value
    assert failure.code == "BUILD_BLOCKED"
    assert len(sandbox.calls) == 1  # never retried
    assert debug_provider.calls == []  # debug agent never invoked for a blocked build


async def test_run_full_never_touches_the_sandbox(
    portfolio_input, valid_requirements_payload, valid_design_payload, valid_architecture_payload, valid_code_generation_payload
):
    """Regression guard: Phase 3's run_full() must keep its exact meaning
    — generate and statically validate, no execution — even though
    GenerationPipeline now also owns a sandbox for run_with_build()'s sake."""
    sandbox = FakeSandbox(results=[])  # any call at all is a failure
    pipeline = _build_pipeline(
        valid_requirements_payload, valid_design_payload, valid_architecture_payload, valid_code_generation_payload, sandbox
    )

    state = await pipeline.run_full(portfolio_input)

    assert state.stage == PipelineStage.COMPLETED
    assert sandbox.calls == []
