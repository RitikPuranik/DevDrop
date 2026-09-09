"""
Covers Section 29's "Pool" and part of "Rate limits" test lists against
storage/gemini_pool_memory.py directly — the repository primitive
everything else (scheduler, provider) builds on.
"""
from datetime import datetime, timedelta, timezone

import pytest

from storage.gemini_pool_base import GeminiProjectNotFoundError
from storage.gemini_pool_memory import InMemoryGeminiPoolRepository
from storage.gemini_pool_models import GeminiProjectCredential, GeminiProjectStatus

NOW = datetime.now(timezone.utc)


def _project(**overrides) -> GeminiProjectCredential:
    defaults = dict(
        name="Project A",
        projectId="proj-a",
        credentialReference="key-a",
        model="gemini-2.0-flash",
    )
    return GeminiProjectCredential(**{**defaults, **overrides})


@pytest.fixture
def repo():
    return InMemoryGeminiPoolRepository()


async def test_zero_projects_list_is_empty(repo):
    assert await repo.list_projects() == []


async def test_create_get_update_project(repo):
    created = await repo.create_project(_project())
    fetched = await repo.get_project(created.id)
    assert fetched.name == "Project A"

    updated = await repo.update_project(created.id, name="Renamed")
    assert updated.name == "Renamed"
    assert updated.updatedAt >= created.updatedAt


async def test_get_missing_project_raises(repo):
    with pytest.raises(GeminiProjectNotFoundError):
        await repo.get_project("does-not-exist")


async def test_delete_project_removes_it_permanently(repo):
    created = await repo.create_project(_project())
    await repo.delete_project(created.id)
    assert await repo.list_projects() == []
    with pytest.raises(GeminiProjectNotFoundError):
        await repo.get_project(created.id)


async def test_reserve_arbitrary_pool_sizes(repo):
    """One project, several projects, many projects — the pool must not
    contain (and this test proves nothing in the code path assumes) a
    fixed count."""
    for count in (1, 3, 10, 60):
        repo = InMemoryGeminiPoolRepository()
        ids = []
        for i in range(count):
            created = await repo.create_project(_project(name=f"p{i}", projectId=f"proj-{i}", credentialReference=f"key-{i}"))
            ids.append(created.id)

        reserved_ids = set()
        for pid in ids:
            r = await repo.reserve(
                pid, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10,
                requested_model=None, daily_reset_hour_utc=0,
            )
            assert r is not None
            reserved_ids.add(r.id)
        assert len(reserved_ids) == count


async def test_reserve_fails_on_already_leased_project(repo):
    p = await repo.create_project(_project())
    r1 = await repo.reserve(p.id, now=NOW, worker_id="w1", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r1 is not None
    r2 = await repo.reserve(p.id, now=NOW, worker_id="w2", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r2 is None  # concurrent reservation — second worker must not get the same project


async def test_reserve_skips_disabled_project(repo):
    p = await repo.create_project(_project(status=GeminiProjectStatus.DISABLED))
    r = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r is None


async def test_reserve_skips_removed_and_invalid_and_auth_error(repo):
    for status in (GeminiProjectStatus.REMOVED, GeminiProjectStatus.INVALID_CREDENTIAL, GeminiProjectStatus.AUTH_ERROR, GeminiProjectStatus.MODEL_UNAVAILABLE):
        p = await repo.create_project(_project(projectId=status.value, status=status))
        r = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
        assert r is None, f"{status} should never be reservable"


async def test_reserve_skips_project_within_live_cooldown(repo):
    p = await repo.create_project(_project(status=GeminiProjectStatus.COOLDOWN_RPM, cooldownUntil=NOW + timedelta(minutes=5)))
    r = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r is None


async def test_reserve_succeeds_after_cooldown_expires(repo):
    p = await repo.create_project(_project(status=GeminiProjectStatus.COOLDOWN_RPM, cooldownUntil=NOW - timedelta(seconds=1)))
    r = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r is not None


async def test_reserve_skips_daily_exhausted_before_reset_boundary(repo):
    p = await repo.create_project(
        _project(status=GeminiProjectStatus.DAILY_EXHAUSTED, dailyWindowStartedAt=NOW, dailyResetAt=NOW + timedelta(hours=12))
    )
    r = await repo.reserve(p.id, now=NOW + timedelta(hours=1), worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r is None


async def test_reserve_recovers_daily_exhausted_after_boundary_and_resets_counter(repo):
    started = NOW.replace(hour=1, minute=0, second=0, microsecond=0)
    p = await repo.create_project(
        _project(
            status=GeminiProjectStatus.DAILY_EXHAUSTED,
            dailyWindowStartedAt=started,
            requestsToday=999,
            rpdLimit=1000,
        )
    )
    tomorrow = started + timedelta(days=1, hours=1)  # well past the next UTC-midnight boundary
    r = await repo.reserve(p.id, now=tomorrow, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r is not None
    assert r.status == GeminiProjectStatus.ACTIVE
    assert r.requestsToday == 1  # reset to 0, then this reservation counted


async def test_reserve_respects_rpm_limit(repo):
    p = await repo.create_project(_project(rpmLimit=2))
    r1 = await repo.reserve(p.id, now=NOW, worker_id="w1", lease_ttl_seconds=0, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    await repo.record_result(p.id, now=NOW, success=True, actual_total_tokens=10, estimated_total_tokens=10, cost_delta=0, status=GeminiProjectStatus.ACTIVE, cooldown_until=None, daily_reset_at=None, error_message=None)
    r2 = await repo.reserve(p.id, now=NOW, worker_id="w2", lease_ttl_seconds=0, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    await repo.record_result(p.id, now=NOW, success=True, actual_total_tokens=10, estimated_total_tokens=10, cost_delta=0, status=GeminiProjectStatus.ACTIVE, cooldown_until=None, daily_reset_at=None, error_message=None)
    r3 = await repo.reserve(p.id, now=NOW, worker_id="w3", lease_ttl_seconds=0, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r1 is not None and r2 is not None
    assert r3 is None  # third request in the same minute exceeds rpmLimit=2


async def test_reserve_respects_tpm_limit(repo):
    p = await repo.create_project(_project(tpmLimit=100))
    r1 = await repo.reserve(p.id, now=NOW, worker_id="w1", lease_ttl_seconds=0, estimated_total_tokens=80, requested_model=None, daily_reset_hour_utc=0)
    assert r1 is not None
    await repo.record_result(p.id, now=NOW, success=True, actual_total_tokens=80, estimated_total_tokens=80, cost_delta=0, status=GeminiProjectStatus.ACTIVE, cooldown_until=None, daily_reset_at=None, error_message=None)
    r2 = await repo.reserve(p.id, now=NOW, worker_id="w2", lease_ttl_seconds=0, estimated_total_tokens=50, requested_model=None, daily_reset_hour_utc=0)
    assert r2 is None  # 80 + 50 > 100


async def test_reserve_respects_rpd_limit(repo):
    p = await repo.create_project(_project(rpdLimit=1, requestsToday=1, dailyWindowStartedAt=NOW))
    r = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=0, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r is None


async def test_reserve_respects_budget_guard(repo):
    p = await repo.create_project(_project(monthlyBudget=10.0, monthlyUsage=10.0))
    r = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert r is None


async def test_reserve_filters_by_model_compatibility(repo):
    p = await repo.create_project(_project(model="gemini-2.0-flash"))
    wrong_model = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model="gemini-2.5-pro", daily_reset_hour_utc=0)
    right_model = await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model="gemini-2.0-flash", daily_reset_hour_utc=0)
    assert wrong_model is None
    assert right_model is not None


async def test_lease_expires_and_frees_the_project(repo):
    p = await repo.create_project(_project())
    await repo.reserve(p.id, now=NOW, worker_id="crashed-worker", lease_ttl_seconds=1, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)

    still_held = await repo.reserve(p.id, now=NOW, worker_id="w2", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert still_held is None  # lease not yet expired

    later = NOW + timedelta(seconds=5)
    freed = await repo.reserve(p.id, now=later, worker_id="w2", lease_ttl_seconds=60, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    assert freed is not None  # a crashed worker's lease must not permanently lock the project


async def test_release_expired_leases_clears_stale_lease_fields(repo):
    p = await repo.create_project(_project())
    await repo.reserve(p.id, now=NOW, worker_id="crashed-worker", lease_ttl_seconds=1, estimated_total_tokens=10, requested_model=None, daily_reset_hour_utc=0)
    cleared = await repo.release_expired_leases(NOW + timedelta(seconds=5))
    assert cleared == 1
    fetched = await repo.get_project(p.id)
    assert fetched.leaseOwner is None
    assert fetched.leaseExpiresAt is None


async def test_record_result_success_releases_lease_and_resets_failure_state(repo):
    p = await repo.create_project(_project(consecutiveFailures=3, status=GeminiProjectStatus.TEMPORARY_FAILURE))
    await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=100, requested_model=None, daily_reset_hour_utc=0)

    updated = await repo.record_result(
        p.id, now=NOW, success=True, actual_total_tokens=90, estimated_total_tokens=100, cost_delta=0.02,
        status=GeminiProjectStatus.ACTIVE, cooldown_until=None, daily_reset_at=None, error_message=None,
    )
    assert updated.leaseOwner is None
    assert updated.leaseExpiresAt is None
    assert updated.status == GeminiProjectStatus.ACTIVE
    assert updated.consecutiveFailures == 0
    assert updated.lastSuccessAt == NOW
    assert updated.lastError is None
    assert updated.tokensThisMinute == 90  # corrected from the 100-token estimate to the real 90
    assert updated.monthlyUsage == pytest.approx(0.02)


async def test_record_result_failure_sets_cooldown_and_increments_failure_count(repo):
    p = await repo.create_project(_project())
    await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=100, requested_model=None, daily_reset_hour_utc=0)

    cooldown_until = NOW + timedelta(seconds=30)
    updated = await repo.record_result(
        p.id, now=NOW, success=False, actual_total_tokens=None, estimated_total_tokens=100, cost_delta=0,
        status=GeminiProjectStatus.COOLDOWN_RPM, cooldown_until=cooldown_until, daily_reset_at=None,
        error_message="429 rate limited",
    )
    assert updated.status == GeminiProjectStatus.COOLDOWN_RPM
    assert updated.cooldownUntil == cooldown_until
    assert updated.consecutiveFailures == 1
    assert updated.lastError == "429 rate limited"
    assert updated.leaseOwner is None  # always released, success or failure


async def test_record_result_with_status_none_leaves_health_fields_untouched(repo):
    """The application-error path (Section 16): release the lease, but
    don't touch status/cooldown/consecutiveFailures/lastError — the
    project didn't do anything wrong."""
    p = await repo.create_project(_project(status=GeminiProjectStatus.ACTIVE, consecutiveFailures=2))
    await repo.reserve(p.id, now=NOW, worker_id="w", lease_ttl_seconds=60, estimated_total_tokens=100, requested_model=None, daily_reset_hour_utc=0)

    updated = await repo.record_result(
        p.id, now=NOW, success=False, actual_total_tokens=None, estimated_total_tokens=100, cost_delta=0,
        status=None, cooldown_until=None, daily_reset_at=None, error_message=None,
    )
    assert updated.leaseOwner is None
    assert updated.status == GeminiProjectStatus.ACTIVE
    assert updated.consecutiveFailures == 2  # untouched
