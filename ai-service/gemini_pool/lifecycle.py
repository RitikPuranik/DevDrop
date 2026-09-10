"""
Gemini Project Pool lifecycle — Sections 4, 21, 25.

The admin API (routes/gemini_pool_admin.py) is a thin HTTP layer over
this module; every function here is plain async Python so the same
lifecycle operations are usable from a script, a startup hook, or a test
without going through FastAPI at all.
"""
import logging
import time
from datetime import datetime, timezone

import gemini_pool.gemini_client as gemini_client
from gemini_pool.errors import classify_gemini_error
from gemini_pool.gemini_client import GeminiCaller
from storage.gemini_pool_base import GeminiPoolRepository
from storage.gemini_pool_models import (
    GeminiProjectCreateRequest,
    GeminiProjectCredential,
    GeminiProjectStatus,
    GeminiProjectTestResult,
    GeminiProjectUpdateRequest,
)

logger = logging.getLogger(__name__)

# A tiny, cheap prompt for POST .../test (Section 21: "Do not consume an
# unnecessarily large request merely to test credentials.") — just enough
# to prove the key/model/project combination actually works end to end.
_TEST_PROMPT = "Reply with exactly one word: OK"

_LEGACY_MIGRATION_PROJECT_ID_MARKER = "legacy-env-migrated"


async def add_project(
    repository: GeminiPoolRepository,
    payload: GeminiProjectCreateRequest,
    *,
    caller: GeminiCaller | None = None,
) -> GeminiProjectCredential:
    """Section 2's "credential is validated -> stored -> ACTIVE -> eligible
    for scheduling" flow. Structural validation (non-empty fields) always
    happens via GeminiProjectCreateRequest's own pydantic constraints
    before this is even called. Live validation — an actual Gemini call —
    only happens if `payload.validateOnAdd` is set; see that field's
    docstring for why it defaults to False.

    `caller` defaults to None and is resolved against
    `gemini_client.call_gemini_api` *inside* the function body (see
    `test_project` below for why) rather than as a bound default
    argument — a bound default is captured once at import time, which
    would make monkeypatching `gemini_pool.gemini_client.call_gemini_api`
    in a test silently not apply here."""
    record = GeminiProjectCredential(
        name=payload.name,
        projectId=payload.projectId,
        credentialReference=payload.apiKey,
        model=payload.model,
        priority=payload.priority,
        rpmLimit=payload.rpmLimit,
        tpmLimit=payload.tpmLimit,
        rpdLimit=payload.rpdLimit,
        monthlyBudget=payload.monthlyBudget,
        status=GeminiProjectStatus.ACTIVE,
    )
    created = await repository.create_project(record)

    if payload.validateOnAdd:
        result = await test_project(repository, created.id, caller=caller)
        if not result.success:
            logger.warning("gemini.project.add_validation_failed", extra={"projectId": created.id})
    return await repository.get_project(created.id)


async def remove_project(repository: GeminiPoolRepository, project_id: str) -> GeminiProjectCredential:
    """Section 4's "remove": soft — flips status so the scheduler
    excludes it from every *future* selection immediately, without
    touching a request that already holds its lease (that request's
    lease and its already-captured credential reference finish or fail
    normally; nothing in the request path re-checks status mid-flight).
    Metadata (usage history, health fields) is preserved, matching the
    admin API's DELETE, which defaults to this rather than a hard purge —
    see routes/gemini_pool_admin.py's `?purge=true`."""
    return await repository.update_project(project_id, status=GeminiProjectStatus.REMOVED)


async def disable_project(repository: GeminiPoolRepository, project_id: str) -> GeminiProjectCredential:
    """Section 4's "disable": same exclusion as remove, but explicitly
    reversible and never a signal to delete anything — this project's
    limits, usage counters and history are exactly what `enable_project`
    below re-evaluates against."""
    return await repository.update_project(project_id, status=GeminiProjectStatus.DISABLED)


async def enable_project(repository: GeminiPoolRepository, project_id: str) -> GeminiProjectCredential:
    """Section 4: "re-enabled projects return to the eligible pool after
    health/quota checks" — enabling doesn't blindly force ACTIVE. It
    re-derives the correct status from whatever state the project's own
    fields already describe: still budget-exhausted stays
    BUDGET_EXHAUSTED, still within a cooldown window stays in that
    cooldown, and only a project with nothing currently blocking it
    actually becomes ACTIVE. AUTH_ERROR/INVALID_CREDENTIAL/
    MODEL_UNAVAILABLE are the one case this function refuses to just
    wave through: those need a real successful call (POST .../test) to
    clear, not just an operator's "enable" click, because there's no
    local field that proves the underlying problem is actually fixed."""
    project = await repository.get_project(project_id)
    now = datetime.now(timezone.utc)

    if project.status in (
        GeminiProjectStatus.AUTH_ERROR,
        GeminiProjectStatus.INVALID_CREDENTIAL,
        GeminiProjectStatus.MODEL_UNAVAILABLE,
    ):
        raise GeminiProjectStillUnhealthyError(project_id, project.status)

    if project.monthlyBudget is not None and project.monthlyUsage >= project.monthlyBudget:
        new_status = GeminiProjectStatus.BUDGET_EXHAUSTED
    elif project.cooldownUntil is not None and project.cooldownUntil > now:
        new_status = project.status if project.status in (
            GeminiProjectStatus.COOLDOWN_RPM,
            GeminiProjectStatus.COOLDOWN_TPM,
            GeminiProjectStatus.TEMPORARY_FAILURE,
        ) else GeminiProjectStatus.TEMPORARY_FAILURE
    elif project.status == GeminiProjectStatus.DAILY_EXHAUSTED and project.dailyResetAt is not None and project.dailyResetAt > now:
        new_status = GeminiProjectStatus.DAILY_EXHAUSTED
    else:
        new_status = GeminiProjectStatus.ACTIVE

    return await repository.update_project(project_id, status=new_status)


class GeminiProjectStillUnhealthyError(Exception):
    def __init__(self, project_id: str, status: GeminiProjectStatus):
        super().__init__(
            f"Gemini project '{project_id}' is {status.value} and needs a successful "
            "POST .../test before it can be re-enabled, not just an enable action."
        )
        self.project_id = project_id
        self.status = status


async def update_project(
    repository: GeminiPoolRepository, project_id: str, payload: GeminiProjectUpdateRequest
) -> GeminiProjectCredential:
    """Generic PATCH — every field except `status` maps straight through.
    `status` is restricted by the caller (routes/gemini_pool_admin.py) to
    "active"/"disabled" before this is ever invoked; enforcing that here
    too would just be a second copy of the same rule, so it isn't.

    `status` and the other fields are independent axes and both get
    applied when given together: any plain-field updates (model,
    apiKey, priority, ...) are written first, then the status
    transition (enable_project/disable_project) runs against that
    already-updated record. Previously the status branch returned
    immediately with `enable_project`/`disable_project`'s own result,
    silently discarding whatever was in `updates` — a PATCH sending
    both `model` and `status` in the same call would flip the status
    but drop the model change with no error.
    """
    updates = {}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.apiKey is not None:
        updates["credentialReference"] = payload.apiKey
    if payload.model is not None:
        updates["model"] = payload.model
    if payload.priority is not None:
        updates["priority"] = payload.priority
    if payload.rpmLimit is not None:
        updates["rpmLimit"] = payload.rpmLimit
    if payload.tpmLimit is not None:
        updates["tpmLimit"] = payload.tpmLimit
    if payload.rpdLimit is not None:
        updates["rpdLimit"] = payload.rpdLimit
    if payload.monthlyBudget is not None:
        updates["monthlyBudget"] = payload.monthlyBudget

    if updates:
        await repository.update_project(project_id, **updates)

    if payload.status is not None:
        if payload.status == "active":
            return await enable_project(repository, project_id)
        if payload.status == "disabled":
            return await disable_project(repository, project_id)
        raise ValueError(f"status must be 'active' or 'disabled' via PATCH, got '{payload.status}'")

    if not updates:
        return await repository.get_project(project_id)
    return await repository.get_project(project_id)


async def test_project(
    repository: GeminiPoolRepository,
    project_id: str,
    *,
    caller: GeminiCaller | None = None,
) -> GeminiProjectTestResult:
    """Section 21: a minimal, real Gemini call through this project's own
    credential/model, with the result recorded onto the project's health
    fields exactly the way a real scheduled request's failure/success
    would be (via the same error classifier) — a manual test and a real
    request update health state through the same one path, not two
    slightly different ones."""
    caller = caller or gemini_client.call_gemini_api
    project = await repository.get_project(project_id)
    started = time.monotonic()
    now = datetime.now(timezone.utc)

    try:
        await caller(
            api_key=project.credentialReference,
            model=project.model,
            prompt=_TEST_PROMPT,
            context=None,
            response_schema=None,
            temperature=0.0,
            timeout_ms=15_000,
        )
    except Exception as exc:
        latency_ms = (time.monotonic() - started) * 1000
        error_class = classify_gemini_error(exc)
        from gemini_pool.errors import ERROR_CLASS_META

        meta = ERROR_CLASS_META[error_class]
        new_status = meta.status if meta.penalizes_project else project.status
        updated = await repository.update_project(
            project_id,
            status=new_status,
            lastFailureAt=now,
            lastError=str(exc)[:500],
        )
        return GeminiProjectTestResult(
            projectId=project_id,
            success=False,
            status=updated.status,
            latencyMs=latency_ms,
            error=str(exc)[:500],
        )

    latency_ms = (time.monotonic() - started) * 1000
    updated = await repository.update_project(
        project_id,
        status=GeminiProjectStatus.ACTIVE,
        lastSuccessAt=now,
        lastError=None,
        consecutiveFailures=0,
    )
    return GeminiProjectTestResult(projectId=project_id, success=True, status=updated.status, latencyMs=latency_ms)


async def ensure_legacy_credential_migrated(repository: GeminiPoolRepository, settings) -> None:
    """Convenience, not a spec requirement: if the pool is enabled
    (GEMINI_POOL_ENABLED=true) but has zero projects configured, and the
    legacy single-credential env vars (GEMINI_API_KEY/GEMINI_MODEL) are
    set, register them as one pool entry automatically instead of making
    "turn on the pool" also mean "lose the credential I already had
    working." Runs once at startup (main.py's lifespan) — if the operator
    goes on to add real pool entries and removes this one, or the pool
    already has entries, this is a no-op.

    Section 26 doesn't want the environment to *define* the pool's
    credentials long-term (no `GEMINI_API_KEY_1..N`), but a single legacy
    key bootstrapping a single pool entry on first run is exactly the "if
    the pool contains only one project, it still works" case, not a
    numbered-keys pattern — this touches the environment exactly once, at
    exactly one key.
    """
    if not settings.gemini_pool_enabled:
        return
    if not settings.gemini_api_key or not settings.gemini_model:
        return

    existing = await repository.list_projects()
    if existing:
        return

    logger.info("gemini.pool.migrating_legacy_credential")
    await repository.create_project(
        GeminiProjectCredential(
            name="Migrated from GEMINI_API_KEY",
            projectId=_LEGACY_MIGRATION_PROJECT_ID_MARKER,
            credentialReference=settings.gemini_api_key,
            model=settings.gemini_model,
            status=GeminiProjectStatus.ACTIVE,
        )
    )
