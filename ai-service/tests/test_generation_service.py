"""Generation service tests — Phase 5, Section 29 'Pipeline Persistence'."""
import json

from agents.architecture_agent import ArchitectureAgent
from agents.code_generation_agent import CodeGenerationAgent
from agents.debug_agent import DebugAgent
from agents.design_agent import DesignAgent
from agents.requirements_agent import RequirementsAgent
from config import Settings
from orchestrator.generation_pipeline import GenerationPipeline
from schemas.build import BuildResult
from services.generation_service import GenerationService
from storage.models import JobStatus, ProjectStatus
from tests.fakes import FakeProvider, FakeSandbox, fixed_response_provider


def _settings(**overrides) -> Settings:
    return Settings(max_schema_retries=2, **overrides)


def _pipeline(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload, sandbox, debug_provider=None):
    return GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(), provider=fixed_response_provider(valid_requirements_payload)),
        design_agent=DesignAgent(settings=_settings(), provider=fixed_response_provider(valid_design_payload)),
        architecture_agent=ArchitectureAgent(settings=_settings(), provider=fixed_response_provider(valid_full_architecture_payload)),
        code_generation_agent=CodeGenerationAgent(settings=_settings(), provider=fixed_response_provider(valid_code_generation_payload)),
        debug_agent=DebugAgent(settings=_settings(), provider=debug_provider or FakeProvider()),
        settings=_settings(),
        sandbox=sandbox,
    )


async def test_successful_generation_persists_job_and_ready_project(
    repository, portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    sandbox = FakeSandbox(results=[BuildResult(status="success", exitCode=0, stdout="ok", durationMs=100)])
    pipeline = _pipeline(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload, sandbox)
    service = GenerationService(repository=repository, pipeline=pipeline)

    job = await service.create_and_run(portfolio_input, owner_id="user-1")

    assert job.status == JobStatus.COMPLETED
    assert job.projectId is not None
    assert job.repairAttempts == 0
    assert job.completedAt is not None

    stored_job = await repository.get_generation_job(job.jobId)
    assert stored_job.status == JobStatus.COMPLETED

    project = await repository.get_project(job.projectId)
    assert project.status == ProjectStatus.READY
    assert project.ownerId == "user-1"
    assert len(project.files) == 13


async def test_failed_generation_persists_job_failure_and_failed_project(
    repository, portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    sandbox = FakeSandbox(results=[BuildResult(status="failed", exitCode=1, stderr="boom")] * 10)
    debug_provider = FakeProvider(
        responses=[
            json.dumps(
                {
                    "diagnosis": "x",
                    "rootCause": {"category": "unknown", "message": "x"},
                    "changes": [
                        {
                            "path": "src/App.jsx",
                            "action": "replace",
                            "reason": "x",
                            "content": "export default function App(){return null}",
                        }
                    ],
                    "confidence": 0.5,
                }
            )
        ]
        * 10
    )
    pipeline = _pipeline(
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        valid_code_generation_payload,
        sandbox,
        debug_provider=debug_provider,
    )
    service = GenerationService(repository=repository, pipeline=pipeline)

    job = await service.create_and_run(portfolio_input)

    assert job.status == JobStatus.FAILED
    assert job.failureCode == "BUILD_REPAIR_EXHAUSTED"
    assert job.completedAt is not None

    # Section 24: a project WAS persisted for diagnostics (code generation
    # succeeded), but it must never be marked ready.
    assert job.projectId is not None
    project = await repository.get_project(job.projectId)
    assert project.status == ProjectStatus.FAILED


async def test_early_failure_persists_job_without_fabricating_a_project(repository):
    """Section 11: if generation never got as far as producing any code,
    there is nothing resembling a project — don't invent one."""
    pipeline = GenerationPipeline(
        requirements_agent=RequirementsAgent(settings=_settings(), provider=FakeProvider(fail_with="no key configured")),
        settings=_settings(),
        sandbox=FakeSandbox(results=[]),
    )
    service = GenerationService(repository=repository, pipeline=pipeline)

    job = await service.create_and_run({"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}})

    assert job.status == JobStatus.FAILED
    assert job.projectId is None


async def test_idempotent_replay_does_not_rerun_the_pipeline(
    repository, portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    sandbox = FakeSandbox(results=[BuildResult(status="success", exitCode=0, stdout="ok", durationMs=100)])
    pipeline = _pipeline(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload, sandbox)
    service = GenerationService(repository=repository, pipeline=pipeline)

    first = await service.create_and_run(portfolio_input, idempotency_key="replay-key")
    second = await service.create_and_run(portfolio_input, idempotency_key="replay-key")

    assert first.jobId == second.jobId
    assert len(sandbox.calls) == 1  # the pipeline ran exactly once, not twice
