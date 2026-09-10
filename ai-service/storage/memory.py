"""
In-memory repository — Phase 5, Section 28.

This is what every test in this phase actually exercises. It implements
storage.base.Repository identically to storage/mongo.py — same method
signatures, same error types, same pagination/idempotency semantics —
so a test written against this repository is testing real behavior, not
a simplified stand-in for it.
"""
from storage.base import (
    DuplicateIdempotencyKeyError,
    JobNotFoundError,
    ProjectNotFoundError,
    Repository,
)
from storage.models import (
    GenerationJob,
    JobStatus,
    Project,
    ProjectPage,
    ProjectSummary,
    is_forward_job_transition,
    utcnow,
)


class InMemoryRepository(Repository):
    """Development/test only — nothing here survives a process restart."""

    def __init__(self):
        self._jobs: dict[str, GenerationJob] = {}
        self._projects: dict[str, Project] = {}
        self._idempotency_index: dict[str, str] = {}  # idempotencyKey -> jobId

    async def create_generation_job(self, job: GenerationJob) -> GenerationJob:
        if job.idempotencyKey is not None and job.idempotencyKey in self._idempotency_index:
            existing = self._jobs[self._idempotency_index[job.idempotencyKey]]
            raise DuplicateIdempotencyKeyError(job.idempotencyKey, existing)
        self._jobs[job.jobId] = job.model_copy(deep=True)
        if job.idempotencyKey is not None:
            self._idempotency_index[job.idempotencyKey] = job.jobId
        return job.model_copy(deep=True)

    async def get_generation_job(self, job_id: str) -> GenerationJob:
        try:
            return self._jobs[job_id].model_copy(deep=True)
        except KeyError:
            raise JobNotFoundError(job_id) from None

    async def update_generation_job(self, job_id: str, **updates) -> GenerationJob:
        current = await self.get_generation_job(job_id)  # raises JobNotFoundError
        if "status" in updates and not is_forward_job_transition(current.status, JobStatus(updates["status"])):
            updates = {k: v for k, v in updates.items() if k != "status"}
        merged = current.model_copy(update={**updates, "updatedAt": utcnow()})
        self._jobs[job_id] = merged
        return merged.model_copy(deep=True)

    async def find_job_by_idempotency_key(self, idempotency_key: str) -> GenerationJob | None:
        job_id = self._idempotency_index.get(idempotency_key)
        if job_id is None:
            return None
        return self._jobs[job_id].model_copy(deep=True)

    async def create_project(self, project: Project) -> Project:
        self._projects[project.projectId] = project.model_copy(deep=True)
        return project.model_copy(deep=True)

    async def get_project(self, project_id: str) -> Project:
        try:
            return self._projects[project_id].model_copy(deep=True)
        except KeyError:
            raise ProjectNotFoundError(project_id) from None

    async def update_project(self, project_id: str, **updates) -> Project:
        current = await self.get_project(project_id)  # raises ProjectNotFoundError
        merged = current.model_copy(update={**updates, "updatedAt": utcnow()})
        self._projects[project_id] = merged
        return merged.model_copy(deep=True)

    async def list_projects(self, page: int, limit: int, owner_id: str | None = None) -> ProjectPage:
        candidates = [p for p in self._projects.values() if owner_id is None or p.ownerId == owner_id]
        candidates.sort(key=lambda p: p.updatedAt, reverse=True)
        total = len(candidates)
        start = (page - 1) * limit
        page_items = candidates[start : start + limit]
        return ProjectPage(
            items=[
                ProjectSummary(
                    projectId=p.projectId, name=p.name, websiteType=p.websiteType, status=p.status, updatedAt=p.updatedAt
                )
                for p in page_items
            ],
            page=page,
            limit=limit,
            total=total,
        )

    def _reset(self) -> None:
        """Test-only convenience — not part of the Repository interface."""
        self._jobs.clear()
        self._projects.clear()
        self._idempotency_index.clear()
