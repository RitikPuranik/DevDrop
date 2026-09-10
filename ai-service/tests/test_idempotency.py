"""Idempotency tests — Phase 5, Section 29 'Idempotency'."""
import pytest

from storage.base import DuplicateIdempotencyKeyError
from storage.models import GenerationJob


async def test_first_request_succeeds(repository):
    job = await repository.create_generation_job(GenerationJob(idempotencyKey="key-1"))
    assert job.idempotencyKey == "key-1"


async def test_repeated_key_raises_deterministically(repository):
    first = await repository.create_generation_job(GenerationJob(idempotencyKey="key-1"))

    with pytest.raises(DuplicateIdempotencyKeyError) as exc_info:
        await repository.create_generation_job(GenerationJob(idempotencyKey="key-1"))

    assert exc_info.value.existing_job.jobId == first.jobId


async def test_find_by_idempotency_key_returns_the_existing_job(repository):
    created = await repository.create_generation_job(GenerationJob(idempotencyKey="key-1"))

    found = await repository.find_job_by_idempotency_key("key-1")

    assert found is not None
    assert found.jobId == created.jobId


async def test_find_by_unknown_key_returns_none(repository):
    found = await repository.find_job_by_idempotency_key("never-used")
    assert found is None


async def test_multiple_jobs_without_a_key_do_not_collide(repository):
    """No idempotency key at all is the common case — those jobs must
    never be treated as duplicates of each other."""
    first = await repository.create_generation_job(GenerationJob())
    second = await repository.create_generation_job(GenerationJob())

    assert first.jobId != second.jobId
