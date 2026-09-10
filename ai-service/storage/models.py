"""
Persistence models — Phase 5, Sections 4-5, 16-19.

Deliberately separate from schemas/ — those describe "the shape of data
flowing through the AI pipeline" (LLM output, build results); these
describe "a database record." A GenerationJob has fields (createdAt,
ownerId, idempotencyKey) that have nothing to do with validating an LLM
response, so they live in their own module rather than being mixed into
schemas/.

`currentStage` is a plain string, not orchestrator.state.PipelineStage,
on purpose — the storage layer shouldn't hard-depend on pipeline
internals (Section 1's "AI service owns its persistence model" extended
to mean the persistence layer doesn't own pipeline internals either). The
service layer (services/generation_service.py) is what translates
PipelineState into these records, so it's the one place that imports both.
"""
from datetime import datetime, timezone
from enum import StrEnum

from pydantic import BaseModel, Field


def new_id() -> str:
    from uuid import uuid4

    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ProjectStatus(StrEnum):
    GENERATING = "generating"
    READY = "ready"
    FAILED = "failed"


class StoredFile(BaseModel):
    path: str
    type: str
    purpose: str
    content: str


class GenerationJob(BaseModel):
    jobId: str = Field(default_factory=new_id)
    projectId: str | None = None
    ownerId: str | None = None
    idempotencyKey: str | None = None
    status: JobStatus = JobStatus.QUEUED
    currentStage: str = "QUEUED"
    repairAttempts: int = 0
    failureCode: str | None = None
    failureMessage: str | None = None
    createdAt: datetime = Field(default_factory=utcnow)
    updatedAt: datetime = Field(default_factory=utcnow)
    completedAt: datetime | None = None


class Project(BaseModel):
    projectId: str = Field(default_factory=new_id)
    jobId: str
    ownerId: str | None = None
    name: str
    websiteType: str
    framework: str
    language: str
    styling: str
    status: ProjectStatus = ProjectStatus.GENERATING
    files: list[StoredFile] = Field(default_factory=list)
    entryPoints: list[str] = Field(default_factory=list)
    directories: list[str] = Field(default_factory=list)
    createdAt: datetime = Field(default_factory=utcnow)
    updatedAt: datetime = Field(default_factory=utcnow)


class ProjectSummary(BaseModel):
    """The metadata-only shape for the list endpoint (Section 34) — never
    carries `files`, so listing 1 project or 1000 costs about the same."""

    projectId: str
    name: str
    websiteType: str
    status: ProjectStatus
    updatedAt: datetime


class ProjectPage(BaseModel):
    items: list[ProjectSummary]
    page: int
    limit: int
    total: int


# Lifecycle ordering used to reject an out-of-order status write (Section
# 35) — e.g. a stale "running" update arriving after "completed" already
# landed shouldn't be able to move status backwards. Terminal statuses
# (completed/failed/cancelled) all sit at the same final rank: once a job
# reaches any of them, nothing should move it to a different status.
_JOB_STATUS_RANK: dict[JobStatus, int] = {
    JobStatus.QUEUED: 0,
    JobStatus.RUNNING: 1,
    JobStatus.COMPLETED: 2,
    JobStatus.FAILED: 2,
    JobStatus.CANCELLED: 2,
}


def is_forward_job_transition(current: JobStatus, new: JobStatus) -> bool:
    return _JOB_STATUS_RANK[new] >= _JOB_STATUS_RANK[current]
