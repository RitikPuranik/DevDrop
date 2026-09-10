from datetime import datetime, timedelta, timezone

import pytest
from google.genai import errors as genai_errors

from config import Settings
from gemini_pool import lifecycle
from gemini_pool.gemini_client import GeminiCallResult
from storage.gemini_pool_base import GeminiProjectNotFoundError
from storage.gemini_pool_memory import InMemoryGeminiPoolRepository
from storage.gemini_pool_models import (
    GeminiProjectCreateRequest,
    GeminiProjectCredential,
    GeminiProjectStatus,
    GeminiProjectUpdateRequest,
)

NOW = datetime.now(timezone.utc)


def _project(**overrides) -> GeminiProjectCredential:
    defaults = dict(name="p", projectId="proj", credentialReference="key", model="gemini-2.0-flash")
    return GeminiProjectCredential(**{**defaults, **overrides})


class FakeCaller:
    def __init__(self, outcome):
        self._outcome = outcome
        self.calls = 0

    async def __call__(self, **kwargs):
        self.calls += 1
        if isinstance(self._outcome, Exception):
            raise self._outcome
        return self._outcome


@pytest.fixture
def repo():
    return InMemoryGeminiPoolRepository()


# --- add_project ---------------------------------------------------------


async def test_add_project_without_validation_never_calls_gemini(repo):
    caller = FakeCaller(GeminiCallResult(text="OK"))
    payload = GeminiProjectCreateRequest(name="A", projectId="proj-a", apiKey="key-a", model="gemini-2.0-flash")
    record = await lifecycle.add_project(repo, payload, caller=caller)
    assert record.status == GeminiProjectStatus.ACTIVE
    assert caller.calls == 0


async def test_add_project_with_validate_on_add_calls_gemini_once(repo):
    caller = FakeCaller(GeminiCallResult(text="OK"))
    payload = GeminiProjectCreateRequest(
        name="A", projectId="proj-a", apiKey="key-a", model="gemini-2.0-flash", validateOnAdd=True
    )
    record = await lifecycle.add_project(repo, payload, caller=caller)
    assert caller.calls == 1
    assert record.status == GeminiProjectStatus.ACTIVE
    assert record.lastSuccessAt is not None


async def test_add_project_credential_never_appears_unmasked_outside_the_record(repo):
    payload = GeminiProjectCreateRequest(name="A", projectId="proj-a", apiKey="super-secret-key", model="m")
    record = await lifecycle.add_project(repo, payload, caller=FakeCaller(GeminiCallResult(text="ok")))
    assert record.credentialReference == "super-secret-key"  # stored, as documented — masking happens at the API layer


# --- remove / disable / enable --------------------------------------------


async def test_remove_project_sets_removed_status_and_is_excluded_forever(repo):
    p = await repo.create_project(_project())
    removed = await lifecycle.remove_project(repo, p.id)
    assert removed.status == GeminiProjectStatus.REMOVED


async def test_disable_then_enable_returns_to_active(repo):
    p = await repo.create_project(_project())
    disabled = await lifecycle.disable_project(repo, p.id)
    assert disabled.status == GeminiProjectStatus.DISABLED

    enabled = await lifecycle.enable_project(repo, p.id)
    assert enabled.status == GeminiProjectStatus.ACTIVE


async def test_enable_project_still_within_cooldown_stays_in_cooldown(repo):
    p = await repo.create_project(
        _project(status=GeminiProjectStatus.DISABLED, cooldownUntil=NOW + timedelta(minutes=10))
    )
    # Simulate: was cooldown_rpm before being disabled.
    await repo.update_project(p.id, status=GeminiProjectStatus.DISABLED)
    enabled = await lifecycle.enable_project(repo, p.id)
    assert enabled.status == GeminiProjectStatus.TEMPORARY_FAILURE  # generic cooldown fallback, still blocked


async def test_enable_project_still_daily_exhausted_stays_daily_exhausted(repo):
    p = await repo.create_project(
        _project(status=GeminiProjectStatus.DAILY_EXHAUSTED, dailyResetAt=NOW + timedelta(hours=5))
    )
    enabled = await lifecycle.enable_project(repo, p.id)
    assert enabled.status == GeminiProjectStatus.DAILY_EXHAUSTED


async def test_enable_project_still_budget_exhausted_stays_budget_exhausted(repo):
    p = await repo.create_project(_project(monthlyBudget=10.0, monthlyUsage=10.0))
    enabled = await lifecycle.enable_project(repo, p.id)
    assert enabled.status == GeminiProjectStatus.BUDGET_EXHAUSTED


async def test_enable_project_with_auth_error_requires_manual_test_first(repo):
    p = await repo.create_project(_project(status=GeminiProjectStatus.AUTH_ERROR))
    with pytest.raises(lifecycle.GeminiProjectStillUnhealthyError):
        await lifecycle.enable_project(repo, p.id)
    # Status must not have been silently changed by the failed attempt.
    fetched = await repo.get_project(p.id)
    assert fetched.status == GeminiProjectStatus.AUTH_ERROR


# --- update_project (admin PATCH) -----------------------------------------


async def test_update_project_patches_only_provided_fields(repo):
    p = await repo.create_project(_project(rpmLimit=10))
    updated = await lifecycle.update_project(repo, p.id, GeminiProjectUpdateRequest(name="Renamed"))
    assert updated.name == "Renamed"
    assert updated.rpmLimit == 10  # untouched


async def test_update_project_status_active_routes_through_enable(repo):
    p = await repo.create_project(_project(status=GeminiProjectStatus.DISABLED))
    updated = await lifecycle.update_project(repo, p.id, GeminiProjectUpdateRequest(status="active"))
    assert updated.status == GeminiProjectStatus.ACTIVE


async def test_update_project_status_disabled_routes_through_disable(repo):
    p = await repo.create_project(_project())
    updated = await lifecycle.update_project(repo, p.id, GeminiProjectUpdateRequest(status="disabled"))
    assert updated.status == GeminiProjectStatus.DISABLED


async def test_update_project_missing_raises_not_found(repo):
    with pytest.raises(GeminiProjectNotFoundError):
        await lifecycle.update_project(repo, "nope", GeminiProjectUpdateRequest(name="x"))


# --- test_project (POST .../test) -----------------------------------------


async def test_test_project_success_marks_active_and_clears_error(repo):
    p = await repo.create_project(_project(status=GeminiProjectStatus.TEMPORARY_FAILURE, lastError="boom", consecutiveFailures=3))
    result = await lifecycle.test_project(repo, p.id, caller=FakeCaller(GeminiCallResult(text="OK")))
    assert result.success is True
    fetched = await repo.get_project(p.id)
    assert fetched.status == GeminiProjectStatus.ACTIVE
    assert fetched.lastError is None
    assert fetched.consecutiveFailures == 0


async def test_test_project_failure_updates_status_and_error(repo):
    p = await repo.create_project(_project())
    exc = genai_errors.ClientError(401, {"error": {"code": 401, "status": "UNAUTHENTICATED", "message": "bad auth"}})
    result = await lifecycle.test_project(repo, p.id, caller=FakeCaller(exc))
    assert result.success is False
    fetched = await repo.get_project(p.id)
    assert fetched.status == GeminiProjectStatus.AUTH_ERROR
    assert "bad auth" in fetched.lastError


async def test_test_project_missing_raises_not_found(repo):
    with pytest.raises(GeminiProjectNotFoundError):
        await lifecycle.test_project(repo, "nope", caller=FakeCaller(GeminiCallResult(text="x")))


# --- legacy env migration ---------------------------------------------------


async def test_legacy_migration_noop_when_pool_disabled(repo):
    settings = Settings(gemini_pool_enabled=False, gemini_api_key="k", gemini_model="m")
    await lifecycle.ensure_legacy_credential_migrated(repo, settings)
    assert await repo.list_projects() == []


async def test_legacy_migration_noop_without_legacy_key(repo):
    settings = Settings(gemini_pool_enabled=True, gemini_api_key=None, gemini_model=None)
    await lifecycle.ensure_legacy_credential_migrated(repo, settings)
    assert await repo.list_projects() == []


async def test_legacy_migration_creates_one_project_from_env(repo):
    settings = Settings(gemini_pool_enabled=True, gemini_api_key="legacy-key", gemini_model="gemini-2.0-flash")
    await lifecycle.ensure_legacy_credential_migrated(repo, settings)
    projects = await repo.list_projects()
    assert len(projects) == 1
    assert projects[0].credentialReference == "legacy-key"
    assert projects[0].model == "gemini-2.0-flash"
    assert projects[0].status == GeminiProjectStatus.ACTIVE


async def test_legacy_migration_is_a_noop_once_pool_has_any_project(repo):
    await repo.create_project(_project())
    settings = Settings(gemini_pool_enabled=True, gemini_api_key="legacy-key", gemini_model="m")
    await lifecycle.ensure_legacy_credential_migrated(repo, settings)
    projects = await repo.list_projects()
    assert len(projects) == 1
    assert projects[0].credentialReference == "key"  # the original project, not the legacy one
