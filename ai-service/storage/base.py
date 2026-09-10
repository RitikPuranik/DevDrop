"""
Repository interface — Phase 5, Sections 2, 21.

The orchestrator/service layer only ever depends on this interface —
storage/memory.py (used by every test) and storage/mongo.py (production,
selected by storage/factory.py based on whether AI_DATABASE_URL is set)
implement it identically, so nothing above this layer knows or cares
which one it's talking to.
"""
from abc import ABC, abstractmethod

from storage.models import GenerationJob, Project, ProjectPage


class StorageError(Exception):
    """Base for every storage-layer error. Routes catch this family and
    map `.code` to the existing API error shape — never a raw
    database-specific exception (Section 21)."""

    code = "STORAGE_ERROR"


class StorageUnavailableError(StorageError):
    code = "STORAGE_UNAVAILABLE"


class JobNotFoundError(StorageError):
    code = "JOB_NOT_FOUND"

    def __init__(self, job_id: str):
        super().__init__(f"Generation job '{job_id}' not found.")
        self.job_id = job_id


class ProjectNotFoundError(StorageError):
    code = "PROJECT_NOT_FOUND"

    def __init__(self, project_id: str):
        super().__init__(f"Project '{project_id}' not found.")
        self.project_id = project_id


class DuplicateIdempotencyKeyError(StorageError):
    code = "DUPLICATE_IDEMPOTENCY_KEY"

    def __init__(self, idempotency_key: str, existing_job: GenerationJob):
        super().__init__(f"A job already exists for idempotency key '{idempotency_key}'.")
        self.idempotency_key = idempotency_key
        self.existing_job = existing_job


class StorageValidationError(StorageError):
    code = "STORAGE_VALIDATION_ERROR"


class Repository(ABC):
    # --- Generation jobs ---

    @abstractmethod
    async def create_generation_job(self, job: GenerationJob) -> GenerationJob:
        """Raises DuplicateIdempotencyKeyError if job.idempotencyKey is set
        and already belongs to a different job."""

    @abstractmethod
    async def get_generation_job(self, job_id: str) -> GenerationJob:
        """Raises JobNotFoundError."""

    @abstractmethod
    async def update_generation_job(self, job_id: str, **updates) -> GenerationJob:
        """Partial update — only the given fields change; `updatedAt` is
        always refreshed to now. Raises JobNotFoundError. Section 35: if
        `updates` includes `status` and it would move status backwards
        from its current value (storage.models.is_forward_job_transition),
        that one field is dropped from the update — every other field in
        `updates` still applies. A stale update shouldn't undo a newer
        one, but it isn't an error either."""

    @abstractmethod
    async def find_job_by_idempotency_key(self, idempotency_key: str) -> GenerationJob | None:
        pass

    # --- Projects ---

    @abstractmethod
    async def create_project(self, project: Project) -> Project:
        pass

    @abstractmethod
    async def get_project(self, project_id: str) -> Project:
        """Raises ProjectNotFoundError."""

    @abstractmethod
    async def update_project(self, project_id: str, **updates) -> Project:
        """Raises ProjectNotFoundError."""

    @abstractmethod
    async def list_projects(self, page: int, limit: int, owner_id: str | None = None) -> ProjectPage:
        """Metadata only (Section 34) — never loads `files`."""
