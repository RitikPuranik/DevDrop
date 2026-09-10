"""
GenerationService — Phase 5, Sections 8, 11, 23-24.

The application layer between routes and the pipeline/repository —
Section 22's "Route -> Service -> Repository -> Database." Routes never
touch the repository or the pipeline directly; they call this.

Scope decision, stated plainly: this phase keeps POST /v1/generation/jobs
synchronous (Section 9 explicitly defers real async job infrastructure),
so job state is persisted at three points — created (queued), about to
run (running), and the final outcome (completed/failed) — rather than
streamed at every internal pipeline stage transition. Section 10's
example event list (stage_started, build_started, repair_attempt, ...)
reads as the eventual shape once an async worker exists; wiring that same
granularity into a still-synchronous request would mean threading a
persistence callback through roughly fifteen call sites inside
GenerationPipeline's already-tested internals for a benefit only a
*second, concurrent* request could observe (the first request already
gets the full result the moment its own call returns). That felt like the
wrong risk to take for this phase. What's real here: a
GET /v1/generation/jobs/{jobId} during an in-flight request will
correctly show "running", just not which exact stage — and the final
record always has the complete, accurate picture, including repair
attempts and failure detail. Documented as a known limitation in the
README, not left implicit.
"""
import logging

from orchestrator.generation_pipeline import GenerationPipeline, PipelineFailure
from storage.base import DuplicateIdempotencyKeyError, Repository
from storage.models import GenerationJob, JobStatus, Project, ProjectStatus, StoredFile, utcnow

logger = logging.getLogger(__name__)


class GenerationService:
    def __init__(self, repository: Repository, pipeline: GenerationPipeline | None = None):
        self._repository = repository
        self._pipeline = pipeline or GenerationPipeline()

    async def create_and_run(
        self,
        input_data: dict,
        idempotency_key: str | None = None,
        owner_id: str | None = None,
    ) -> GenerationJob:
        if idempotency_key:
            existing = await self._repository.find_job_by_idempotency_key(idempotency_key)
            if existing is not None:
                logger.info(
                    "generation_job_idempotent_hit", extra={"jobId": existing.jobId, "idempotencyKey": idempotency_key}
                )
                return existing

        job = GenerationJob(idempotencyKey=idempotency_key, ownerId=owner_id)
        try:
            job = await self._repository.create_generation_job(job)
        except DuplicateIdempotencyKeyError as exc:
            # Lost a race with another request using the same key between
            # our check above and this create — its result is exactly as
            # valid as the one we would have produced.
            logger.info("generation_job_idempotent_race", extra={"jobId": exc.existing_job.jobId})
            return exc.existing_job
        logger.info("generation_job_created", extra={"jobId": job.jobId, "ownerId": owner_id})

        job = await self._repository.update_generation_job(
            job.jobId, status=JobStatus.RUNNING, currentStage="ANALYZING_REQUIREMENTS"
        )
        logger.info("generation_job_updated", extra={"jobId": job.jobId, "status": "running"})

        try:
            state = await self._pipeline.run_with_build(input_data, job_id=job.jobId)
        except PipelineFailure as exc:
            project_id = None
            if "CODE_GENERATION" in exc.state.completedStages:
                logger.info("project_persist_started", extra={"jobId": job.jobId})
                try:
                    project = await self._repository.create_project(
                        _build_project_record(job.jobId, owner_id, input_data, exc.state, ProjectStatus.FAILED)
                    )
                    project_id = project.projectId
                    logger.info("project_persist_completed", extra={"jobId": job.jobId, "projectId": project_id})
                except Exception:
                    logger.exception("project_persist_failed", extra={"jobId": job.jobId})
                    # The job's own failure record below is what matters
                    # most here — losing the diagnostic project shouldn't
                    # also obscure the real failure reason.

            job = await self._repository.update_generation_job(
                job.jobId,
                status=JobStatus.FAILED,
                currentStage=exc.stage,
                repairAttempts=exc.state.repairAttempt,
                failureCode=exc.code,
                failureMessage=exc.message,
                projectId=project_id,
                completedAt=utcnow(),
            )
            logger.info("generation_job_updated", extra={"jobId": job.jobId, "status": "failed", "code": exc.code})
            return job

        logger.info("project_persist_started", extra={"jobId": job.jobId})
        project = await self._repository.create_project(
            _build_project_record(job.jobId, owner_id, input_data, state, ProjectStatus.READY)
        )
        logger.info("project_persist_completed", extra={"jobId": job.jobId, "projectId": project.projectId})

        job = await self._repository.update_generation_job(
            job.jobId,
            status=JobStatus.COMPLETED,
            currentStage=state.stage.value,
            repairAttempts=state.repairAttempt,
            projectId=project.projectId,
            completedAt=utcnow(),
        )
        logger.info("generation_job_updated", extra={"jobId": job.jobId, "status": "completed"})
        return job


def _build_project_record(job_id: str, owner_id: str | None, input_data: dict, state, status: ProjectStatus) -> Project:
    """Section 6/24: only ever builds from a normalized, schema-validated
    source — `state.finalProject` (a ProjectManifest dump, set on every
    build attempt in Phase 4) when a build was attempted at all, or the
    Code Generation output plus Architecture's entryPoints/directories
    when generation never got as far as a build attempt. Never called with
    raw, unvalidated LLM output — the pipeline itself doesn't expose that
    as a `state` field."""
    if state.finalProject is not None:
        source = state.finalProject
        entry_points = source.get("entryPoints", [])
        directories = source.get("directories", [])
    else:
        source = state.outputs["CODE_GENERATION"]
        architecture = state.outputs.get("ARCHITECTURE", {})
        entry_points = architecture.get("entryPoints", [])
        directories = architecture.get("directories", [])

    project_info = source["project"]
    return Project(
        jobId=job_id,
        ownerId=owner_id,
        name=project_info.get("name") or input_data.get("websiteType", "project"),
        websiteType=input_data.get("websiteType", "portfolio"),
        framework=project_info["framework"],
        language=project_info["language"],
        styling=project_info["styling"],
        status=status,
        files=[StoredFile(**f) for f in source["files"]],
        entryPoints=entry_points,
        directories=directories,
    )
