"""
Gemini Project Pool — persistence models.

Kept in `storage/` next to `storage/models.py` (jobs/projects) rather than
merged into it: `GeminiProjectCredential` is a database record with its own
lifecycle (add/remove/enable/disable, lease, usage counters) that has
nothing to do with a generation job or a generated website project. Same
separation-of-concerns reasoning storage/models.py's own docstring gives
for keeping persistence models out of schemas/.

This module only defines *data* — the enum, the record, and the
request/response shapes the admin API (routes/gemini_pool_admin.py) uses.
The actual scheduling/lifecycle *behavior* lives in gemini_pool/.
"""
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

from storage.models import new_id, utcnow


class GeminiProjectStatus(StrEnum):
    """Section 6's suggested state machine, adapted to this repo's
    lowercase-string enum convention (storage.models.JobStatus/
    ProjectStatus already do this; PipelineStage's UPPER_CASE is the one
    exception, for a pipeline-internal enum that's never persisted).

    ACTIVE, DISABLED and REMOVED are the only statuses an admin sets
    directly (via the lifecycle operations in gemini_pool/lifecycle.py).
    Every other status is written by the scheduler itself as the outcome
    of a real request — see gemini_pool/errors.py for the
    error-classification -> status mapping (Section 16).
    """

    ACTIVE = "active"
    COOLDOWN_RPM = "cooldown_rpm"
    COOLDOWN_TPM = "cooldown_tpm"
    DAILY_EXHAUSTED = "daily_exhausted"
    BUDGET_EXHAUSTED = "budget_exhausted"
    INVALID_CREDENTIAL = "invalid_credential"
    AUTH_ERROR = "auth_error"
    TEMPORARY_FAILURE = "temporary_failure"
    MODEL_UNAVAILABLE = "model_unavailable"
    DISABLED = "disabled"
    REMOVED = "removed"


# Statuses that require an explicit admin action (enable/test) to leave —
# they are never time-based, unlike a cooldown or a daily-quota reset.
# Used by the scheduler's eligibility check and by lifecycle.enable_project.
TERMINAL_UNTIL_MANUAL_ACTION = frozenset(
    {
        GeminiProjectStatus.INVALID_CREDENTIAL,
        GeminiProjectStatus.AUTH_ERROR,
        GeminiProjectStatus.MODEL_UNAVAILABLE,
        GeminiProjectStatus.DISABLED,
        GeminiProjectStatus.REMOVED,
    }
)


class GeminiProjectCredential(BaseModel):
    """One entry in the pool — Section 3.

    Field groups map directly onto the spec:
    - identity: id, name, projectId, credentialReference, provider, model
    - lifecycle: status, priority
    - rate limits (config): rpmLimit, tpmLimit, rpdLimit
    - rate limit counters (live state): requestsThisMinute,
      tokensThisMinute, requestsToday, plus the two window-start fields
      the spec doesn't name but any RPM/TPM/RPD tracker needs somewhere —
      "how long has the current minute/day window been open" — kept next
      to the counters they gate rather than invented ad hoc in the
      scheduler.
    - budget: monthlyUsage, monthlyBudget (Section 13 — an internal
      estimate, never Google's authoritative billing)
    - health: cooldownUntil, dailyResetAt, lastSuccessAt, lastFailureAt,
      lastError, consecutiveFailures (the last one drives the
      exponential-backoff-with-jitter cooldown length in
      gemini_pool/scheduler.py, and the recentFailurePenalty scoring term
      in gemini_pool/scoring.py)
    - lease (Sections 14-15): leaseOwner, leaseExpiresAt — not in the
      spec's minimum field list, but the lease *has* to live somewhere,
      and it lives with the record it's leasing.
    - timestamps: createdAt, updatedAt

    Security note (Section 3/27): `credentialReference` holds the raw
    Gemini API key in plaintext. This codebase has no secrets-manager
    integration to reference instead (nothing in config.py or elsewhere
    does — `GEMINI_API_KEY` itself is a plaintext env var read directly
    into providers/gemini.py). Per the spec's own fallback instruction
    ("if plaintext API keys are currently the only supported mechanism,
    isolate them behind a credential abstraction and document the
    limitation"): every read of this field goes through
    gemini_pool/lifecycle.py or providers/gemini_pool_provider.py, never
    directly from a route handler, and it is never included in any API
    response (routes/gemini_pool_admin.py always converts to
    GeminiProjectPublic, which masks it) or in any log line (see
    gemini_pool/errors.py's `scrub_secret`). If this repo ever adds a
    real secrets-manager integration, this field is the one place that
    needs to change into an actual reference.
    """

    id: str = Field(default_factory=new_id)
    name: str
    projectId: str
    credentialReference: str
    provider: str = "gemini"
    model: str
    status: GeminiProjectStatus = GeminiProjectStatus.ACTIVE
    priority: int = 100  # lower = scheduled first, see gemini_pool/scoring.py

    rpmLimit: int | None = None
    tpmLimit: int | None = None
    rpdLimit: int | None = None

    requestsThisMinute: int = 0
    tokensThisMinute: int = 0
    requestsToday: int = 0
    minuteWindowStartedAt: datetime = Field(default_factory=utcnow)
    dailyWindowStartedAt: datetime = Field(default_factory=utcnow)

    monthlyUsage: float = 0.0
    monthlyBudget: float | None = None

    cooldownUntil: datetime | None = None
    dailyResetAt: datetime | None = None

    lastSuccessAt: datetime | None = None
    lastFailureAt: datetime | None = None
    lastError: str | None = None
    consecutiveFailures: int = 0

    leaseOwner: str | None = None
    leaseExpiresAt: datetime | None = None

    createdAt: datetime = Field(default_factory=utcnow)
    updatedAt: datetime = Field(default_factory=utcnow)


# --- Admin API request/response shapes (Section 20) ---------------------


class GeminiProjectCreateRequest(BaseModel):
    name: str
    projectId: str
    apiKey: str = Field(min_length=1, description="Raw Gemini API key. Never echoed back.")
    model: str
    priority: int = 100
    rpmLimit: int | None = None
    tpmLimit: int | None = None
    rpdLimit: int | None = None
    monthlyBudget: float | None = None
    # Section 2's "credential is validated" step, kept opt-in: validating
    # means a real Gemini call, and Section 30 is explicit that CI/tests
    # must not depend on Gemini being reachable. Default False so `add`
    # never needs network; an operator (or the admin UI) can pass true, or
    # call POST .../{id}/test right after.
    validateOnAdd: bool = False


class GeminiProjectUpdateRequest(BaseModel):
    """All optional — PATCH semantics, only provided fields change.

    `status` here is intentionally restricted (in
    routes/gemini_pool_admin.py) to the two states an admin is allowed to
    set directly, "active" and "disabled" — every other status
    (cooldowns, exhaustion, invalid-credential, ...) is the scheduler's
    own bookkeeping and would be silently overwritten on the next request
    if a human could set it here too.
    """

    name: str | None = None
    apiKey: str | None = None
    model: str | None = None
    priority: int | None = None
    rpmLimit: int | None = None
    tpmLimit: int | None = None
    rpdLimit: int | None = None
    monthlyBudget: float | None = None
    status: str | None = None


class GeminiProjectPublic(BaseModel):
    """Section 20: "DO NOT expose credentials in GET responses. Return
    safe metadata only." Every admin route response goes through
    `from_record` below rather than dumping the record directly."""

    id: str
    name: str
    projectId: str
    maskedCredential: str
    model: str
    status: GeminiProjectStatus
    priority: int
    rpmLimit: int | None
    tpmLimit: int | None
    rpdLimit: int | None
    requestsThisMinute: int
    tokensThisMinute: int
    requestsToday: int
    monthlyUsage: float
    monthlyBudget: float | None
    budgetState: str
    cooldownUntil: datetime | None
    dailyResetAt: datetime | None
    lastSuccessAt: datetime | None
    lastFailureAt: datetime | None
    lastError: str | None
    consecutiveFailures: int
    createdAt: datetime
    updatedAt: datetime

    @classmethod
    def from_record(cls, record: GeminiProjectCredential, budget_state: str) -> "GeminiProjectPublic":
        return cls(
            id=record.id,
            name=record.name,
            projectId=record.projectId,
            maskedCredential=mask_secret(record.credentialReference),
            model=record.model,
            status=record.status,
            priority=record.priority,
            rpmLimit=record.rpmLimit,
            tpmLimit=record.tpmLimit,
            rpdLimit=record.rpdLimit,
            requestsThisMinute=record.requestsThisMinute,
            tokensThisMinute=record.tokensThisMinute,
            requestsToday=record.requestsToday,
            monthlyUsage=record.monthlyUsage,
            monthlyBudget=record.monthlyBudget,
            budgetState=budget_state,
            cooldownUntil=record.cooldownUntil,
            dailyResetAt=record.dailyResetAt,
            lastSuccessAt=record.lastSuccessAt,
            lastFailureAt=record.lastFailureAt,
            lastError=record.lastError,
            consecutiveFailures=record.consecutiveFailures,
            createdAt=record.createdAt,
            updatedAt=record.updatedAt,
        )


class GeminiPoolHealth(BaseModel):
    """Section 23's aggregate pool view."""

    totalProjects: int
    activeProjects: int
    cooldownProjects: int
    dailyExhaustedProjects: int
    budgetExhaustedProjects: int
    invalidProjects: int
    disabledProjects: int
    availableProjects: int
    requestsInFlight: int


class GeminiProjectTestResult(BaseModel):
    projectId: str
    success: bool
    status: GeminiProjectStatus
    latencyMs: float | None = None
    error: str | None = None


def mask_secret(value: str) -> str:
    """Never return enough of a credential to be useful — Section 20/27.
    Short values (test fixtures, obviously-placeholder keys) collapse to
    a fixed-width mask rather than leaking their full length."""
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"
