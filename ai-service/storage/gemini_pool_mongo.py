"""
MongoDB Gemini Project Pool repository.

Same disclaimer storage/mongo.py already gives, worth repeating here
rather than assuming it still applies: written against pymongo's native
async API (`AsyncMongoClient`) and the current documented aggregation/
query operators, but there is no MongoDB server reachable in this
sandbox, so nothing below has been run against a real database. Every
test in this phase exercises storage/gemini_pool_memory.py instead — see
that module's own docstring. Worth a real smoke test before this goes
anywhere near production, exactly as storage/mongo.py already says about
itself.

Concurrency mechanism for `reserve` (Section 14 — multi-worker safety):
optimistic concurrency control via the record's own `updatedAt` field.
`reserve` reads the document, decides in Python (using the *exact same*
`storage.gemini_pool_windows.effective_counts` eligibility logic
storage/gemini_pool_memory.py and gemini_pool/scheduler.py's optimistic
pre-filter also use — one rule, three call sites) whether this worker
should get the project, then writes with a filter that requires
`updatedAt` to still equal the value it just read. If another worker
reserved (or an admin edited) the same document in between, that write
matches zero documents and `find_one_and_update` returns None — exactly
like losing an atomic compare-and-swap. The caller (GeminiScheduler)
already treats "reservation failed" as "try the next-ranked candidate,"
not an error, so a lost race here just means this project is skipped for
this one attempt.

This was chosen over a hand-written aggregation-pipeline update (which
could in principle do the window-reset-and-claim in a single
server-side atomic operation) because it reuses the one already-tested
eligibility function instead of re-deriving the same "has this window
expired" logic in MongoDB's aggregation expression language, where it
would be far harder to verify by reading — and, per the disclaimer
above, impossible to verify by actually running it here. If this
repository turns out to be a real contention hot spot in production
(many workers racing for the same handful of projects), a pipeline-based
single-round-trip version is the natural next optimization; the
`GeminiPoolRepository` interface doesn't change either way.
"""
from datetime import datetime, timedelta

from pymongo import AsyncMongoClient, ReturnDocument

from storage.gemini_pool_base import GeminiPoolRepository, GeminiProjectNotFoundError
from storage.gemini_pool_models import TERMINAL_UNTIL_MANUAL_ACTION, GeminiProjectCredential, GeminiProjectStatus
from storage.gemini_pool_windows import effective_counts

_PROJECTS_COLLECTION = "gemini_pool_projects"


def _strip_mongo_id(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


class MongoGeminiPoolRepository(GeminiPoolRepository):
    def __init__(self, database_url: str, database_name: str):
        self._client = AsyncMongoClient(database_url)
        self._db = self._client[database_name]
        self._projects = self._db[_PROJECTS_COLLECTION]

    async def ensure_indexes(self) -> None:
        """Called once at startup (main.py), same pattern as
        storage/mongo.py's own ensure_indexes.
        - id: every get/update/reserve goes by this (unique — the logical
          primary key, not Mongo's own _id, matching storage/mongo.py's
          jobId/projectId convention).
        - status: the admin pool-health aggregate (Section 23) and the
          scheduler's list_projects() both effectively scan/group by this.
        """
        await self._projects.create_index("id", unique=True)
        await self._projects.create_index("status")

    async def close(self) -> None:
        await self._client.close()

    async def create_project(self, project: GeminiProjectCredential) -> GeminiProjectCredential:
        await self._projects.insert_one(project.model_dump(mode="json"))
        return project

    async def get_project(self, project_id: str) -> GeminiProjectCredential:
        doc = await self._projects.find_one({"id": project_id})
        if doc is None:
            raise GeminiProjectNotFoundError(project_id)
        return GeminiProjectCredential(**_strip_mongo_id(doc))

    async def update_project(self, project_id: str, **updates) -> GeminiProjectCredential:
        from storage.models import utcnow

        doc = await self._projects.find_one_and_update(
            {"id": project_id},
            {"$set": _jsonable({**updates, "updatedAt": utcnow()})},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            raise GeminiProjectNotFoundError(project_id)
        return GeminiProjectCredential(**_strip_mongo_id(doc))

    async def list_projects(self) -> list[GeminiProjectCredential]:
        cursor = self._projects.find({})
        docs = await cursor.to_list(None)  # PyMongo Async: to_list(None) means "all", same as storage/mongo.py
        return [GeminiProjectCredential(**_strip_mongo_id(d)) for d in docs]

    async def delete_project(self, project_id: str) -> None:
        result = await self._projects.delete_one({"id": project_id})
        if result.deleted_count == 0:
            raise GeminiProjectNotFoundError(project_id)

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
        doc = await self._projects.find_one({"id": project_id})
        if doc is None:
            return None
        project = GeminiProjectCredential(**_strip_mongo_id(doc))
        read_updated_at = project.updatedAt

        if project.status in TERMINAL_UNTIL_MANUAL_ACTION:
            return None
        if requested_model is not None and project.model != requested_model:
            return None
        if project.leaseOwner is not None and project.leaseExpiresAt is not None and project.leaseExpiresAt > now:
            return None

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

        new_status = (
            GeminiProjectStatus.ACTIVE
            if project.status == GeminiProjectStatus.DAILY_EXHAUSTED and counts.daily_window_reset
            else project.status
        )
        update_fields = {
            "leaseOwner": worker_id,
            "leaseExpiresAt": now + timedelta(seconds=lease_ttl_seconds),
            "requestsThisMinute": counts.requests_this_minute + 1,
            "tokensThisMinute": counts.tokens_this_minute + estimated_total_tokens,
            "requestsToday": counts.requests_today + 1,
            "minuteWindowStartedAt": now if counts.minute_window_reset else project.minuteWindowStartedAt,
            "dailyWindowStartedAt": now if counts.daily_window_reset else project.dailyWindowStartedAt,
            "status": new_status.value,
            "updatedAt": now,
        }

        result = await self._projects.find_one_and_update(
            # The `updatedAt` equality check is the compare-and-swap guard
            # described in this module's docstring — it fails (returns
            # None) if anything wrote to this document since we read it
            # above, which is exactly what should make this reservation
            # attempt fail rather than silently double-book the project.
            {"id": project_id, "updatedAt": read_updated_at},
            {"$set": update_fields},
            return_document=ReturnDocument.AFTER,
        )
        if result is None:
            return None
        return GeminiProjectCredential(**_strip_mongo_id(result))

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
        doc = await self._projects.find_one({"id": project_id})
        if doc is None:
            raise GeminiProjectNotFoundError(project_id)
        project = GeminiProjectCredential(**_strip_mongo_id(doc))

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
            updates["status"] = status.value
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

        result = await self._projects.find_one_and_update(
            {"id": project_id},
            {"$set": _jsonable(updates)},
            return_document=ReturnDocument.AFTER,
        )
        if result is None:
            raise GeminiProjectNotFoundError(project_id)
        return GeminiProjectCredential(**_strip_mongo_id(result))

    async def release_expired_leases(self, now: datetime) -> int:
        result = await self._projects.update_many(
            {"leaseExpiresAt": {"$ne": None, "$lte": now}},
            {"$set": {"leaseOwner": None, "leaseExpiresAt": None}},
        )
        return result.modified_count


def _jsonable(updates: dict) -> dict:
    """Same normalization storage/mongo.py's own `_jsonable` does — a
    StrEnum member needs to become its plain string value before a $set,
    not every pymongo driver version encodes it correctly on its own."""
    result = {}
    for key, value in updates.items():
        if hasattr(value, "value") and not isinstance(value, datetime):
            result[key] = value.value
        else:
            result[key] = value
    return result
