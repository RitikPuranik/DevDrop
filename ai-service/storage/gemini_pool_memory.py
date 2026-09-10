"""
In-memory Gemini Project Pool repository.

Same relationship to storage/gemini_pool_mongo.py that storage/memory.py
has to storage/mongo.py: identical interface, no real persistence, and —
critically for this module — the one repository this phase's tests
actually exercise (Section 30: CI must not depend on Gemini/Mongo being
reachable).

Concurrency model: a single `asyncio.Lock` around every read-modify-write
gives real atomicity for `reserve`/`record_result` *within one process*.
That's a materially different (weaker) guarantee than
storage/gemini_pool_mongo.py's cross-process compare-and-swap — this
repository is documented, same as storage/memory.py, as single-process
only. Section 14's "if the current service is single-process only,
implement a clean abstraction that can later be backed by Redis" is
satisfied by the *interface* (GeminiPoolRepository) being the thing
gemini_pool/scheduler.py depends on — swapping this file for a
Redis-backed one later doesn't touch the scheduler at all.
"""
import asyncio
from datetime import datetime, timedelta

from storage.gemini_pool_base import GeminiPoolRepository, GeminiProjectNotFoundError
from storage.gemini_pool_models import TERMINAL_UNTIL_MANUAL_ACTION, GeminiProjectCredential, GeminiProjectStatus
from storage.gemini_pool_windows import effective_counts
from storage.models import utcnow


class InMemoryGeminiPoolRepository(GeminiPoolRepository):
    def __init__(self):
        self._projects: dict[str, GeminiProjectCredential] = {}
        self._lock = asyncio.Lock()

    async def create_project(self, project: GeminiProjectCredential) -> GeminiProjectCredential:
        async with self._lock:
            self._projects[project.id] = project.model_copy(deep=True)
            return project.model_copy(deep=True)

    async def get_project(self, project_id: str) -> GeminiProjectCredential:
        try:
            return self._projects[project_id].model_copy(deep=True)
        except KeyError:
            raise GeminiProjectNotFoundError(project_id) from None

    async def update_project(self, project_id: str, **updates) -> GeminiProjectCredential:
        async with self._lock:
            current = self._projects.get(project_id)
            if current is None:
                raise GeminiProjectNotFoundError(project_id)
            merged = current.model_copy(update={**updates, "updatedAt": utcnow()})
            self._projects[project_id] = merged
            return merged.model_copy(deep=True)

    async def list_projects(self) -> list[GeminiProjectCredential]:
        return [p.model_copy(deep=True) for p in self._projects.values()]

    async def delete_project(self, project_id: str) -> None:
        async with self._lock:
            if project_id not in self._projects:
                raise GeminiProjectNotFoundError(project_id)
            del self._projects[project_id]

    async def reserve(
        self,
        project_id: str,
        *,
        now: datetime,
        worker_id: str,
        lease_ttl_seconds: int,
        estimated_total_tokens: int,
        requested_model: str | None,
        daily_reset_hour_utc: int,
    ) -> GeminiProjectCredential | None:
        async with self._lock:
            project = self._projects.get(project_id)
            if project is None:
                return None

            if project.status in TERMINAL_UNTIL_MANUAL_ACTION:
                return None
            if requested_model is not None and project.model != requested_model:
                return None
            if project.leaseOwner is not None and project.leaseExpiresAt is not None and project.leaseExpiresAt > now:
                return None  # already leased by another in-flight request

            counts = effective_counts(project, now, daily_reset_hour_utc)

            if project.status == GeminiProjectStatus.DAILY_EXHAUSTED and not counts.daily_window_reset:
                return None
            if project.cooldownUntil is not None and project.cooldownUntil > now and not counts.minute_window_reset:
                return None
            if project.rpmLimit is not None and counts.requests_this_minute + 1 > project.rpmLimit:
                return None
            if project.tpmLimit is not None and counts.tokens_this_minute + estimated_total_tokens > project.tpmLimit:
                return None
            if project.rpdLimit is not None and counts.requests_today + 1 > project.rpdLimit:
                return None
            if project.monthlyBudget is not None and project.monthlyUsage >= project.monthlyBudget:
                return None

            updated = project.model_copy(
                update={
                    "leaseOwner": worker_id,
                    "leaseExpiresAt": now + timedelta(seconds=lease_ttl_seconds),
                    "requestsThisMinute": counts.requests_this_minute + 1,
                    "tokensThisMinute": counts.tokens_this_minute + estimated_total_tokens,
                    "requestsToday": counts.requests_today + 1,
                    "minuteWindowStartedAt": now if counts.minute_window_reset else project.minuteWindowStartedAt,
                    "dailyWindowStartedAt": now if counts.daily_window_reset else project.dailyWindowStartedAt,
                    # A daily-quota project that's back inside a fresh day
                    # window is eligible again (Section 12) — reflect that
                    # in status immediately rather than waiting for
                    # record_result.
                    "status": GeminiProjectStatus.ACTIVE
                    if project.status == GeminiProjectStatus.DAILY_EXHAUSTED and counts.daily_window_reset
                    else project.status,
                    "updatedAt": now,
                }
            )
            self._projects[project_id] = updated
            return updated.model_copy(deep=True)

    async def record_result(
        self,
        project_id: str,
        *,
        now: datetime,
        success: bool,
        actual_total_tokens: int | None,
        estimated_total_tokens: int,
        cost_delta: float,
        status: GeminiProjectStatus | None,
        cooldown_until: datetime | None,
        daily_reset_at: datetime | None,
        error_message: str | None,
        release_lease: bool = True,
    ) -> GeminiProjectCredential:
        async with self._lock:
            project = self._projects.get(project_id)
            if project is None:
                raise GeminiProjectNotFoundError(project_id)

            updates: dict = {"updatedAt": now}
            if release_lease:
                updates["leaseOwner"] = None
                updates["leaseExpiresAt"] = None

            if actual_total_tokens is not None:
                delta = actual_total_tokens - estimated_total_tokens
                updates["tokensThisMinute"] = max(0, project.tokensThisMinute + delta)
            if cost_delta:
                updates["monthlyUsage"] = project.monthlyUsage + cost_delta

            if status is not None:
                updates["status"] = status
                updates["cooldownUntil"] = cooldown_until
                updates["dailyResetAt"] = daily_reset_at
                if status == GeminiProjectStatus.ACTIVE:
                    updates["consecutiveFailures"] = 0
                    updates["lastSuccessAt"] = now
                    updates["lastError"] = None
                else:
                    updates["consecutiveFailures"] = project.consecutiveFailures + 1
                    updates["lastFailureAt"] = now
                    updates["lastError"] = error_message

            merged = project.model_copy(update=updates)
            self._projects[project_id] = merged
            return merged.model_copy(deep=True)

    async def release_expired_leases(self, now: datetime) -> int:
        async with self._lock:
            cleared = 0
            for project_id, project in list(self._projects.items()):
                if project.leaseExpiresAt is not None and project.leaseExpiresAt <= now:
                    self._projects[project_id] = project.model_copy(
                        update={"leaseOwner": None, "leaseExpiresAt": None}
                    )
                    cleared += 1
            return cleared

    def _reset(self) -> None:
        """Test-only convenience, mirrors InMemoryRepository._reset()."""
        self._projects.clear()
