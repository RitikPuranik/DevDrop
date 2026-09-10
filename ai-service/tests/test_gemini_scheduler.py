import pytest

from config import Settings
from gemini_pool.errors import GeminiErrorClass
from gemini_pool.scheduler import GeminiPoolExhaustedError, GeminiScheduler
from storage.gemini_pool_memory import InMemoryGeminiPoolRepository
from storage.gemini_pool_models import GeminiProjectCredential, GeminiProjectStatus


def _project(**overrides) -> GeminiProjectCredential:
    defaults = dict(name="p", projectId="proj", credentialReference="key", model="gemini-2.0-flash")
    return GeminiProjectCredential(**{**defaults, **overrides})


@pytest.fixture
def repo():
    return InMemoryGeminiPoolRepository()


@pytest.fixture
def scheduler(repo):
    return GeminiScheduler(repo, Settings(gemini_pool_enabled=True))


async def test_zero_projects_raises_pool_exhausted_with_zero_total(scheduler):
    with pytest.raises(GeminiPoolExhaustedError) as exc_info:
        await scheduler.select_and_reserve(
            requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w"
        )
    assert exc_info.value.total_configured == 0
    assert "empty" in str(exc_info.value).lower()


async def test_one_project_pool_still_works(repo, scheduler):
    await repo.create_project(_project())
    credential = await scheduler.select_and_reserve(
        requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w"
    )
    assert credential is not None


async def test_selects_healthiest_of_many_candidates(repo, scheduler):
    for i in range(10):
        await repo.create_project(_project(projectId=f"p{i}", credentialReference=f"k{i}", priority=100))
    # Make one project clearly best: highest priority (lowest number), no failures.
    best = await repo.create_project(_project(projectId="best", credentialReference="kbest", priority=1))

    credential = await scheduler.select_and_reserve(
        requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w"
    )
    assert credential.id == best.id


async def test_all_projects_ineligible_raises_pool_exhausted_with_nonzero_total(repo, scheduler):
    await repo.create_project(_project(status=GeminiProjectStatus.DISABLED))
    await repo.create_project(_project(projectId="p2", status=GeminiProjectStatus.DISABLED))
    with pytest.raises(GeminiPoolExhaustedError) as exc_info:
        await scheduler.select_and_reserve(
            requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w"
        )
    assert exc_info.value.total_configured == 2


async def test_attempted_project_ids_are_excluded_from_selection(repo, scheduler):
    p1 = await repo.create_project(_project(projectId="p1", credentialReference="k1"))
    p2 = await repo.create_project(_project(projectId="p2", credentialReference="k2"))

    credential = await scheduler.select_and_reserve(
        requested_model=None, estimated_total_tokens=10, attempted_project_ids={p1.id}, worker_id="w"
    )
    assert credential.id == p2.id


async def test_record_result_rpm_failure_sets_cooldown_with_backoff(repo, scheduler):
    p = await repo.create_project(_project())
    await scheduler.select_and_reserve(requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w")

    updated = await scheduler.record_result(
        p.id, success=False, estimated_total_tokens=10, error=Exception("429"), error_class=GeminiErrorClass.RPM
    )
    assert updated.status == GeminiProjectStatus.COOLDOWN_RPM
    assert updated.cooldownUntil is not None
    assert updated.cooldownUntil > updated.updatedAt  # cooldown extends into the future from "now"


async def test_record_result_rpd_failure_sets_daily_exhausted_with_reset_time(repo, scheduler):
    p = await repo.create_project(_project())
    await scheduler.select_and_reserve(requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w")

    updated = await scheduler.record_result(
        p.id, success=False, estimated_total_tokens=10, error=Exception("RPD"), error_class=GeminiErrorClass.RPD
    )
    assert updated.status == GeminiProjectStatus.DAILY_EXHAUSTED
    assert updated.dailyResetAt is not None


async def test_record_result_auth_error_has_no_cooldown_timer_needs_manual_action(repo, scheduler):
    p = await repo.create_project(_project())
    await scheduler.select_and_reserve(requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w")

    updated = await scheduler.record_result(
        p.id, success=False, estimated_total_tokens=10, error=Exception("401"), error_class=GeminiErrorClass.AUTH
    )
    assert updated.status == GeminiProjectStatus.AUTH_ERROR
    assert updated.cooldownUntil is None  # time won't fix this, an operator must


async def test_record_result_application_error_does_not_penalize_project(repo, scheduler):
    p = await repo.create_project(_project())
    await scheduler.select_and_reserve(requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w")

    updated = await scheduler.record_result(
        p.id,
        success=False,
        estimated_total_tokens=10,
        error=Exception("bad prompt"),
        error_class=GeminiErrorClass.APPLICATION_ERROR,
    )
    assert updated.status == GeminiProjectStatus.ACTIVE  # untouched
    assert updated.consecutiveFailures == 0


async def test_repeated_failures_increase_backoff_duration(repo, scheduler):
    p = await repo.create_project(_project())
    await scheduler.select_and_reserve(requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w")
    first = await scheduler.record_result(
        p.id, success=False, estimated_total_tokens=10, error=Exception("429"), error_class=GeminiErrorClass.RPM
    )
    first_cooldown_length = first.cooldownUntil - first.updatedAt

    # Same project failing again — record_result doesn't require holding
    # an active lease (it's what a scheduled request calls once it's
    # already done, success or fail), so this can go straight to a second
    # recorded failure without re-reserving through a live cooldown.
    second = await scheduler.record_result(
        p.id, success=False, estimated_total_tokens=10, error=Exception("429"), error_class=GeminiErrorClass.RPM
    )
    second_cooldown_length = second.cooldownUntil - second.updatedAt

    assert second_cooldown_length >= first_cooldown_length


async def test_recovery_after_cooldown_makes_project_eligible_again(repo, scheduler):
    p = await repo.create_project(_project(status=GeminiProjectStatus.COOLDOWN_RPM, cooldownUntil=None))
    # Simulate a cooldown that has already elapsed.
    await repo.update_project(p.id, cooldownUntil=None)
    credential = await scheduler.select_and_reserve(
        requested_model=None, estimated_total_tokens=10, attempted_project_ids=set(), worker_id="w"
    )
    assert credential is not None


async def test_pool_health_counts_reflect_dynamic_state(repo, scheduler):
    await repo.create_project(_project(projectId="a", status=GeminiProjectStatus.ACTIVE))
    await repo.create_project(_project(projectId="b", credentialReference="kb", status=GeminiProjectStatus.DISABLED))
    await repo.create_project(_project(projectId="c", credentialReference="kc", status=GeminiProjectStatus.DAILY_EXHAUSTED))

    health = await scheduler.pool_health()
    assert health["totalProjects"] == 3
    assert health["activeProjects"] == 1
    assert health["disabledProjects"] == 1
    assert health["dailyExhaustedProjects"] == 1


async def test_pool_health_numbers_are_never_hard_coded_to_a_fixed_pool_size(repo, scheduler):
    for i in range(37):
        await repo.create_project(_project(projectId=f"p{i}", credentialReference=f"k{i}"))
    health = await scheduler.pool_health()
    assert health["totalProjects"] == 37
    assert health["activeProjects"] == 37
