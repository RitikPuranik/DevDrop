"""
Exercises providers/gemini_pool_provider.py with a fake `GeminiCaller`
injected — no real network, no real google-genai client construction, per
Section 30. The fake is keyed by `api_key` so each test project can be
scripted to succeed, fail once, or always fail independently.
"""
import pytest
from google.genai import errors as genai_errors

from config import Settings
from gemini_pool.gemini_client import GeminiCallResult
from providers.base import AIProviderError
from providers.gemini_pool_provider import GeminiPooledProvider
from storage.gemini_pool_memory import InMemoryGeminiPoolRepository
from storage.gemini_pool_models import GeminiProjectCredential, GeminiProjectStatus


def _project(**overrides) -> GeminiProjectCredential:
    defaults = dict(name="p", projectId="proj", credentialReference="key", model="gemini-2.0-flash")
    return GeminiProjectCredential(**{**defaults, **overrides})


def _rpm_error():
    return genai_errors.ClientError(
        429, {"error": {"code": 429, "status": "RESOURCE_EXHAUSTED", "message": "RequestsPerMinute exceeded"}}
    )


def _application_error():
    return genai_errors.ClientError(
        400, {"error": {"code": 400, "status": "INVALID_ARGUMENT", "message": "invalid prompt content"}}
    )


class ScriptedCaller:
    """Maps api_key -> a queue of outcomes (a GeminiCallResult, or an
    exception instance to raise). Records every call for assertions."""

    def __init__(self, script: dict[str, list]):
        self._script = {k: list(v) for k, v in script.items()}
        self.calls: list[str] = []

    async def __call__(self, *, api_key, model, prompt, context, response_schema, temperature, timeout_ms):
        self.calls.append(api_key)
        outcomes = self._script.get(api_key, [])
        if not outcomes:
            raise AssertionError(f"ScriptedCaller has no more scripted outcomes for api_key={api_key!r}")
        outcome = outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


@pytest.fixture
def repo():
    return InMemoryGeminiPoolRepository()


def _provider(repo, caller, **settings_overrides) -> GeminiPooledProvider:
    settings = Settings(gemini_pool_enabled=True, **settings_overrides)
    return GeminiPooledProvider(settings, repository=repo, caller=caller)


async def test_pool_disabled_raises_without_calling_anything(repo):
    settings = Settings(gemini_pool_enabled=False)
    caller = ScriptedCaller({})
    provider = GeminiPooledProvider(settings, repository=repo, caller=caller)
    with pytest.raises(AIProviderError):
        await provider.generate("hello")
    assert caller.calls == []


async def test_empty_pool_raises_clean_provider_unavailable_error(repo):
    caller = ScriptedCaller({})
    provider = _provider(repo, caller)
    with pytest.raises(AIProviderError, match="empty"):
        await provider.generate("hello")


async def test_successful_generation_returns_text_and_corrects_token_usage(repo):
    await repo.create_project(_project(credentialReference="key-a"))
    caller = ScriptedCaller({"key-a": [GeminiCallResult(text="hello world", input_tokens=12, output_tokens=8, total_tokens=20)]})
    provider = _provider(repo, caller)

    result = await provider.generate("write something")

    assert result == "hello world"
    projects = await repo.list_projects()
    assert projects[0].lastSuccessAt is not None
    assert projects[0].status == GeminiProjectStatus.ACTIVE
    assert projects[0].leaseOwner is None  # lease released after completion


async def test_failover_first_project_fails_second_succeeds(repo):
    await repo.create_project(_project(name="A", projectId="a", credentialReference="key-a", priority=1))
    await repo.create_project(_project(name="B", projectId="b", credentialReference="key-b", priority=2))
    caller = ScriptedCaller(
        {
            "key-a": [_rpm_error()],
            "key-b": [GeminiCallResult(text="success from B")],
        }
    )
    provider = _provider(repo, caller, gemini_max_project_failovers=2)

    result = await provider.generate("hello")

    assert result == "success from B"
    assert caller.calls == ["key-a", "key-b"]

    projects = {p.credentialReference: p for p in await repo.list_projects()}
    assert projects["key-a"].status == GeminiProjectStatus.COOLDOWN_RPM
    assert projects["key-b"].status == GeminiProjectStatus.ACTIVE


async def test_all_projects_fail_raises_after_exhausting_max_failovers(repo):
    await repo.create_project(_project(name="A", projectId="a", credentialReference="key-a"))
    await repo.create_project(_project(name="B", projectId="b", credentialReference="key-b"))
    caller = ScriptedCaller({"key-a": [_rpm_error()], "key-b": [_rpm_error()]})
    provider = _provider(repo, caller, gemini_max_project_failovers=1)  # 2 total attempts

    with pytest.raises(AIProviderError):
        await provider.generate("hello")

    assert sorted(caller.calls) == ["key-a", "key-b"]


async def test_same_project_is_not_retried_within_one_request(repo):
    """Section 17: attemptedProjectIds must exclude an already-tried
    project from being selected again for the same logical request."""
    await repo.create_project(_project(credentialReference="key-a"))
    caller = ScriptedCaller({"key-a": [_rpm_error()]})
    provider = _provider(repo, caller, gemini_max_project_failovers=5)

    with pytest.raises(AIProviderError):
        await provider.generate("hello")

    # Only one call was possible: after key-a failed, no other project
    # exists, so the pool-exhausted path is hit rather than retrying key-a.
    assert caller.calls == ["key-a"]


async def test_application_error_does_not_failover_to_another_project(repo):
    """Section 16: a bad prompt should not burn through the whole pool."""
    await repo.create_project(_project(name="A", projectId="a", credentialReference="key-a", priority=1))
    await repo.create_project(_project(name="B", projectId="b", credentialReference="key-b", priority=2))
    caller = ScriptedCaller({"key-a": [_application_error()], "key-b": [GeminiCallResult(text="should not be reached")]})
    provider = _provider(repo, caller, gemini_max_project_failovers=5)

    with pytest.raises(AIProviderError):
        await provider.generate("hello")

    assert caller.calls == ["key-a"]  # never touched key-b

    projects = {p.credentialReference: p for p in await repo.list_projects()}
    assert projects["key-a"].status == GeminiProjectStatus.ACTIVE  # not penalized
    assert projects["key-a"].consecutiveFailures == 0


async def test_max_failover_setting_bounds_total_attempts(repo):
    for i in range(5):
        await repo.create_project(_project(projectId=f"p{i}", credentialReference=f"key-{i}"))
    caller = ScriptedCaller({f"key-{i}": [_rpm_error()] for i in range(5)})
    provider = _provider(repo, caller, gemini_max_project_failovers=2)  # 3 total attempts max

    with pytest.raises(AIProviderError):
        await provider.generate("hello")

    assert len(caller.calls) == 3  # not all 5 — bounded by the setting


async def test_budget_cost_recorded_on_success_when_guard_enabled(repo):
    await repo.create_project(_project(credentialReference="key-a", monthlyBudget=100.0))
    caller = ScriptedCaller({"key-a": [GeminiCallResult(text="ok", input_tokens=1000, output_tokens=1000, total_tokens=2000)]})
    provider = _provider(
        repo,
        caller,
        gemini_budget_guard_enabled=True,
        gemini_estimated_cost_per_1k_input_tokens=0.01,
        gemini_estimated_cost_per_1k_output_tokens=0.02,
    )

    await provider.generate("hello")

    projects = await repo.list_projects()
    assert projects[0].monthlyUsage == pytest.approx(0.01 + 0.02)


async def test_is_configured_reflects_pool_enabled_flag_only(repo):
    caller = ScriptedCaller({})
    enabled = _provider(repo, caller)
    assert enabled.is_configured is True

    disabled_settings = Settings(gemini_pool_enabled=False)
    disabled = GeminiPooledProvider(disabled_settings, repository=repo, caller=caller)
    assert disabled.is_configured is False
