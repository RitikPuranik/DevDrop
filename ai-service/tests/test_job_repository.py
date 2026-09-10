"""Job repository tests — Phase 5, Section 29 'Job Repository'."""
import pytest

from storage.base import JobNotFoundError
from storage.models import GenerationJob, JobStatus, utcnow


async def test_create_and_get(repository):
    job = GenerationJob()
    created = await repository.create_generation_job(job)

    fetched = await repository.get_generation_job(created.jobId)

    assert fetched.jobId == created.jobId
    assert fetched.status == JobStatus.QUEUED


async def test_get_not_found_raises(repository):
    with pytest.raises(JobNotFoundError):
        await repository.get_generation_job("does-not-exist")


async def test_update_changes_only_given_fields(repository):
    job = await repository.create_generation_job(GenerationJob())

    updated = await repository.update_generation_job(job.jobId, status=JobStatus.RUNNING)

    assert updated.status == JobStatus.RUNNING
    assert updated.currentStage == job.currentStage  # untouched field survives


async def test_update_not_found_raises(repository):
    with pytest.raises(JobNotFoundError):
        await repository.update_generation_job("does-not-exist", status=JobStatus.RUNNING)


async def test_updated_at_advances_on_update(repository):
    job = await repository.create_generation_job(GenerationJob())
    original_updated_at = job.updatedAt

    updated = await repository.update_generation_job(job.jobId, status=JobStatus.RUNNING)

    assert updated.updatedAt >= original_updated_at
    assert updated.createdAt == job.createdAt  # createdAt never changes


async def test_completed_at_can_be_set(repository):
    job = await repository.create_generation_job(GenerationJob())

    now = utcnow()
    updated = await repository.update_generation_job(job.jobId, status=JobStatus.COMPLETED, completedAt=now)

    assert updated.completedAt == now


@pytest.mark.parametrize(
    "transitions",
    [
        [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.COMPLETED],
        [JobStatus.QUEUED, JobStatus.RUNNING, JobStatus.FAILED],
        [JobStatus.QUEUED, JobStatus.CANCELLED],
    ],
)
async def test_forward_state_transitions_apply(repository, transitions):
    job = await repository.create_generation_job(GenerationJob())
    for status in transitions[1:]:  # first is the initial QUEUED state already
        job = await repository.update_generation_job(job.jobId, status=status)
    assert job.status == transitions[-1]


async def test_stale_update_cannot_move_status_backwards(repository):
    """Section 35: a late-arriving 'running' update shouldn't undo an
    already-recorded 'completed' — a real scenario if two updates for the
    same job ever raced (e.g. a retried request)."""
    job = await repository.create_generation_job(GenerationJob())
    job = await repository.update_generation_job(job.jobId, status=JobStatus.RUNNING)
    job = await repository.update_generation_job(job.jobId, status=JobStatus.COMPLETED)

    stale = await repository.update_generation_job(job.jobId, status=JobStatus.RUNNING, repairAttempts=2)

    assert stale.status == JobStatus.COMPLETED  # status held, not overwritten
    assert stale.repairAttempts == 2  # but other fields in the same call still applied
