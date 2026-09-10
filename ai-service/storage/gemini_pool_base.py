"""
Gemini Project Pool — repository interface.

Mirrors storage/base.py's own shape on purpose: an ABC the scheduler and
the admin API depend on, with an in-memory implementation
(storage/gemini_pool_memory.py, what every test exercises) and a MongoDB
implementation (storage/gemini_pool_mongo.py, selected by the same
AI_DATABASE_URL switch storage/factory.py already uses) behind it.

The one method that isn't a plain CRUD operation is `reserve` — Sections
8/9/14/15 (eligibility, scheduling, multi-worker safety, leasing) all
collapse into a single atomic "does this project qualify right now, and
if so, claim it" operation. Putting the eligibility check and the claim
in one atomic step is what makes this safe under concurrent workers: a
plain "read status, decide in Python, write lease" would race two workers
into the same project. See each implementation for how it makes this
atomic.
"""
from abc import ABC, abstractmethod
from datetime import datetime

from storage.gemini_pool_models import GeminiProjectCredential, GeminiProjectStatus


class GeminiPoolError(Exception):
    code = "GEMINI_POOL_ERROR"


class GeminiProjectNotFoundError(GeminiPoolError):
    code = "GEMINI_PROJECT_NOT_FOUND"

    def __init__(self, project_id: str):
        super().__init__(f"Gemini project '{project_id}' not found.")
        self.project_id = project_id


class GeminiPoolRepository(ABC):
    # --- Lifecycle CRUD (Section 4, 20) ---

    @abstractmethod
    async def create_project(self, project: GeminiProjectCredential) -> GeminiProjectCredential:
        pass

    @abstractmethod
    async def get_project(self, project_id: str) -> GeminiProjectCredential:
        """Raises GeminiProjectNotFoundError."""

    @abstractmethod
    async def update_project(self, project_id: str, **updates) -> GeminiProjectCredential:
        """Plain partial update — no eligibility semantics, used by the
        admin API for name/limits/status/credential-rotation edits.
        Raises GeminiProjectNotFoundError."""

    @abstractmethod
    async def list_projects(self) -> list[GeminiProjectCredential]:
        """Every project regardless of status — callers filter. Section 25
        says not to cache this forever; callers (the scheduler) are
        expected to call this fresh per scheduling decision or from a
        short-lived cache they invalidate themselves, not this method's
        job to cache."""

    @abstractmethod
    async def delete_project(self, project_id: str) -> None:
        """Physical delete — used only by the admin API's `?purge=true`
        (routes/gemini_pool_admin.py), never by the scheduler and never
        the default behavior of a DELETE request. The default `remove`
        lifecycle operation (gemini_pool/lifecycle.py) sets status=REMOVED
        instead, which is what Section 4 actually needs (permanently
        excluded from scheduling, in-flight requests unaffected) while
        keeping usage/health history queryable. Raises
        GeminiProjectNotFoundError."""

    # --- Scheduling primitive (Sections 8/9/14/15) ---

    @abstractmethod
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
        """Atomically re-check eligibility and claim the project in one
        step, or return None if it's no longer eligible (already leased
        by another worker, went into cooldown, model mismatch, etc. since
        the caller last read it).

        On success, this also performs any window resets that are due
        (Section 10-12: a minute/day boundary crossing since the last
        request makes the project eligible again without any explicit
        "wake up" call) and provisionally counts this request against
        the (possibly just-reset) RPM/TPM/RPD counters — corrected to the
        real token count by `record_result` once the call actually
        completes.
        """

    @abstractmethod
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
        """Releases the lease this project was reserved under and records
        the outcome — corrects the provisional token count from `reserve`
        to the real usage, updates health timestamps, and applies the
        status/cooldown transition the caller (gemini_pool/scheduler.py,
        using gemini_pool/errors.py's classification) decided on. Passing
        `status=None` leaves status untouched — used for Section 16's
        "application error" case, where the project itself did nothing
        wrong and shouldn't be penalized. Raises GeminiProjectNotFoundError."""

    @abstractmethod
    async def release_expired_leases(self, now: datetime) -> int:
        """Section 15: "the lease must expire automatically if a worker
        crashes." Nothing calls this to *check* eligibility — `reserve`'s
        own atomic condition already treats an expired lease as free —
        this exists purely so a periodic housekeeping task (or a test)
        can clear stale leaseOwner/leaseExpiresAt fields for observability
        (the admin API's `requestsInFlight` count would otherwise keep
        counting a crashed worker's lease as in-flight until the next
        reservation attempt happens to overwrite it). Returns the number
        of leases cleared."""
