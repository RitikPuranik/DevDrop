"""
GeminiScheduler — Sections 7-15.

Every Gemini request goes through `select_and_reserve` exactly once per
project attempt (providers/gemini_pool_provider.py calls it again, with
the failed project added to `attempted_project_ids`, on failover). Agents
never see this class at all — see that provider module for how it's
wired in behind the existing `AIProvider` interface (Section 32).

Two-phase eligibility, and why: `list_ranked_candidates` does a cheap,
*optimistic* filter/rank entirely in Python over data the repository just
returned (Section 9's scoring, Section 8's eligibility checks) — this is
what lets a 100+ project pool pick a good candidate without a DB
round-trip per project. `select_and_reserve` then asks the repository to
atomically re-confirm and claim the top-ranked candidate — this is the
authoritative check (Section 14: multi-worker safety), because the
optimistic view can be stale the instant another worker reserves the same
project first. A failed reservation just moves on to the next-ranked
candidate; it is not an error.
"""
import logging
import random
from datetime import datetime, timedelta, timezone

from config import Settings
from gemini_pool.errors import ERROR_CLASS_META, GeminiErrorClass, scrub_secret
from gemini_pool.scoring import rank_candidates
from storage.gemini_pool_base import GeminiPoolRepository
from storage.gemini_pool_models import (
    TERMINAL_UNTIL_MANUAL_ACTION,
    GeminiProjectCredential,
    GeminiProjectStatus,
)
from storage.gemini_pool_windows import effective_counts, next_daily_boundary

logger = logging.getLogger(__name__)


class GeminiPoolExhaustedError(Exception):
    """Section 5/24: raised when no eligible project exists, whether
    because the pool is genuinely empty (`total_configured == 0`) or
    every configured project is currently ineligible. Either way the
    caller's response is the same clean "provider unavailable" —
    `total_configured` is carried only so the log line / error message
    can say which situation it was, for whoever's debugging it."""

    def __init__(self, total_configured: int):
        self.total_configured = total_configured
        if total_configured == 0:
            super().__init__("Gemini project pool is empty — no projects are configured.")
        else:
            super().__init__(
                f"Gemini project pool exhausted — all {total_configured} configured project(s) are "
                "currently ineligible (cooldown, quota, budget, or disabled)."
            )


def budget_state(project: GeminiProjectCredential, settings: Settings) -> str:
    if project.monthlyBudget is None or project.monthlyBudget <= 0:
        return "normal"
    ratio = project.monthlyUsage / project.monthlyBudget
    if ratio >= 1.0:
        return "exhausted"
    if ratio >= settings.gemini_budget_critical_threshold:
        return "critical"
    if ratio >= settings.gemini_budget_warning_threshold:
        return "warning"
    return "normal"


def compute_backoff_cooldown(now: datetime, base_ms: int, consecutive_failures: int, max_ms: int) -> datetime:
    """Exponential backoff with jitter (Section 10): doubles per
    consecutive failure on *this* project, capped, plus up to 25% random
    jitter so many workers hitting the same quota wall don't all retry on
    the exact same tick (Section 10: "Do not synchronize every worker to
    retry at the exact same timestamp.")."""
    exponent = min(consecutive_failures, 8)  # cap so this can't overflow/blow past max_ms pointlessly
    delay_ms = min(max_ms, base_ms * (2**exponent))
    jitter_ms = random.uniform(0, delay_ms * 0.25)
    return now + timedelta(milliseconds=delay_ms + jitter_ms)


class GeminiScheduler:
    def __init__(self, repository: GeminiPoolRepository, settings: Settings):
        self._repository = repository
        self._settings = settings

    async def list_ranked_candidates(
        self,
        *,
        requested_model: str | None,
        estimated_total_tokens: int,
        exclude_ids: set[str],
        now: datetime,
    ) -> tuple[list[GeminiProjectCredential], int]:
        """Returns (ranked eligible candidates, total configured
        projects) — the latter purely so GeminiPoolExhaustedError can
        report whether the pool was empty or just fully busy."""
        all_projects = await self._repository.list_projects()
        eligible = [
            p
            for p in all_projects
            if p.id not in exclude_ids
            and p.status not in TERMINAL_UNTIL_MANUAL_ACTION
            and (requested_model is None or p.model == requested_model)
            and self._passes_optimistic_limits(p, now, estimated_total_tokens)
        ]
        return rank_candidates(eligible, now, estimated_total_tokens), len(all_projects)

    def _passes_optimistic_limits(self, project: GeminiProjectCredential, now: datetime, estimated_total_tokens: int) -> bool:
        counts = effective_counts(project, now, self._settings.gemini_daily_reset_hour_utc)

        if not counts.minute_window_reset and project.cooldownUntil is not None and project.cooldownUntil > now:
            # Only a live cooldown (RPM/TPM/temporary-failure) actually
            # blocks scheduling; a status label alone doesn't (it's
            # advisory until the window/cooldown clock says otherwise).
            return False
        if project.status == GeminiProjectStatus.DAILY_EXHAUSTED and not counts.daily_window_reset:
            return False
        if project.rpmLimit is not None and counts.requests_this_minute + 1 > project.rpmLimit:
            return False
        if project.tpmLimit is not None and counts.tokens_this_minute + estimated_total_tokens > project.tpmLimit:
            return False
        if project.rpdLimit is not None and counts.requests_today + 1 > project.rpdLimit:
            return False
        if (
            self._settings.gemini_budget_guard_enabled
            and project.monthlyBudget is not None
            and project.monthlyUsage >= project.monthlyBudget
        ):
            return False
        return True

    async def select_and_reserve(
        self,
        *,
        requested_model: str | None,
        estimated_total_tokens: int,
        attempted_project_ids: set[str],
        worker_id: str,
    ) -> GeminiProjectCredential:
        now = datetime.now(timezone.utc)
        candidates, total = await self.list_ranked_candidates(
            requested_model=requested_model,
            estimated_total_tokens=estimated_total_tokens,
            exclude_ids=attempted_project_ids,
            now=now,
        )

        for candidate in candidates:
            reserved = await self._repository.reserve(
                candidate.id,
                now=now,
                worker_id=worker_id,
                lease_ttl_seconds=self._settings.gemini_lease_ttl_seconds,
                estimated_total_tokens=estimated_total_tokens,
                requested_model=requested_model,
                daily_reset_hour_utc=self._settings.gemini_daily_reset_hour_utc,
            )
            if reserved is not None:
                logger.info(
                    "gemini.project.selected",
                    extra={
                        "projectId": reserved.id,
                        "projectName": reserved.name,
                        "model": reserved.model,
                        "attempt": len(attempted_project_ids) + 1,
                    },
                )
                return reserved
            # Lost the race, or went ineligible between the optimistic
            # read above and now — try the next-ranked candidate rather
            # than failing the whole request over one contested project.

        logger.warning("gemini.pool.empty", extra={"totalConfigured": total, "attempted": len(attempted_project_ids)})
        raise GeminiPoolExhaustedError(total)

    async def release(self, project_id: str, worker_id: str) -> None:
        """Best-effort release for paths that abort before a
        `record_result` call would naturally happen (e.g. the provider
        raising before the Gemini call is even made). Safe to call even
        if the lease already expired or was never held — the repository
        only clears a lease this `worker_id` actually owns."""
        try:
            await self._repository.record_result(
                project_id,
                now=datetime.now(timezone.utc),
                success=False,
                actual_total_tokens=None,
                estimated_total_tokens=0,
                cost_delta=0.0,
                status=None,
                cooldown_until=None,
                daily_reset_at=None,
                error_message=None,
            )
        except Exception:  # pragma: no cover - best-effort cleanup only
            logger.warning("gemini.lease.release_failed", extra={"projectId": project_id})

    async def record_result(
        self,
        project_id: str,
        *,
        success: bool,
        estimated_total_tokens: int,
        actual_total_tokens: int | None = None,
        error: Exception | None = None,
        error_class: GeminiErrorClass | None = None,
        cost_delta: float = 0.0,
        credential_reference: str | None = None,
    ) -> GeminiProjectCredential:
        now = datetime.now(timezone.utc)

        status: GeminiProjectStatus | None = None
        cooldown_until: datetime | None = None
        daily_reset_at: datetime | None = None
        error_message: str | None = None

        if success:
            # Explicit ACTIVE, not "leave status alone": a successful
            # call proves this project is healthy *right now*, which
            # should always win over a stale COOLDOWN_*/DAILY_EXHAUSTED/
            # TEMPORARY_FAILURE label the repository hadn't gotten a
            # chance to clear yet. See storage/gemini_pool_*.py's
            # record_result for the status/cooldown/daily_reset_at
            # "always a coherent triple when status is not None" contract
            # this relies on.
            status = GeminiProjectStatus.ACTIVE
            logger.info("gemini.request.success", extra={"projectId": project_id})
        elif error_class is not None:
            meta = ERROR_CLASS_META[error_class]
            error_message = scrub_secret(str(error) if error else None, credential_reference)
            log_event = {
                GeminiErrorClass.RPM: "gemini.project.cooldown",
                GeminiErrorClass.TPM: "gemini.project.cooldown",
                GeminiErrorClass.RPD: "gemini.project.daily_exhausted",
            }.get(error_class, "gemini.request.failed")
            logger.warning(
                log_event,
                extra={"projectId": project_id, "errorClass": error_class.value, "penalized": meta.penalizes_project},
            )
            if meta.penalizes_project:
                status = meta.status
                if error_class in (GeminiErrorClass.RPM, GeminiErrorClass.TPM):
                    current = await self._repository.get_project(project_id)
                    cooldown_until = compute_backoff_cooldown(
                        now,
                        self._settings.gemini_cooldown_default_ms,
                        current.consecutiveFailures,
                        self._settings.gemini_cooldown_max_ms,
                    )
                elif error_class == GeminiErrorClass.RPD:
                    daily_reset_at = next_daily_boundary(now, self._settings.gemini_daily_reset_hour_utc)
                elif error_class in (GeminiErrorClass.SERVER_ERROR, GeminiErrorClass.TIMEOUT, GeminiErrorClass.UNKNOWN):
                    current = await self._repository.get_project(project_id)
                    cooldown_until = compute_backoff_cooldown(
                        now,
                        self._settings.gemini_cooldown_default_ms,
                        current.consecutiveFailures,
                        self._settings.gemini_cooldown_max_ms,
                    )
                # AUTH / INVALID_CREDENTIAL / MODEL_UNAVAILABLE: no
                # cooldown timer — Section: these need a human (re-enable
                # or POST .../test), not a clock.

        return await self._repository.record_result(
            project_id,
            now=now,
            success=success,
            actual_total_tokens=actual_total_tokens,
            estimated_total_tokens=estimated_total_tokens,
            cost_delta=cost_delta,
            status=status,
            cooldown_until=cooldown_until,
            daily_reset_at=daily_reset_at,
            error_message=error_message,
        )

    async def pool_health(self) -> dict:
        """Section 23's aggregate view, also used by GET
        /v1/admin/gemini-projects/health/summary."""
        now = datetime.now(timezone.utc)
        projects = await self._repository.list_projects()
        counts = {status: 0 for status in GeminiProjectStatus}
        in_flight = 0
        for p in projects:
            counts[p.status] += 1
            if p.leaseExpiresAt is not None and p.leaseExpiresAt > now:
                in_flight += 1

        available = sum(
            1
            for p in projects
            if p.status not in TERMINAL_UNTIL_MANUAL_ACTION and self._passes_optimistic_limits(p, now, 0)
        )

        return {
            "totalProjects": len(projects),
            "activeProjects": counts[GeminiProjectStatus.ACTIVE],
            "cooldownProjects": counts[GeminiProjectStatus.COOLDOWN_RPM] + counts[GeminiProjectStatus.COOLDOWN_TPM],
            "dailyExhaustedProjects": counts[GeminiProjectStatus.DAILY_EXHAUSTED],
            "budgetExhaustedProjects": counts[GeminiProjectStatus.BUDGET_EXHAUSTED],
            "invalidProjects": counts[GeminiProjectStatus.INVALID_CREDENTIAL] + counts[GeminiProjectStatus.AUTH_ERROR],
            "disabledProjects": counts[GeminiProjectStatus.DISABLED],
            "availableProjects": available,
            "requestsInFlight": in_flight,
        }
