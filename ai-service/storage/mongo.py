"""
MongoDB repository — Phase 5, Section 3.

Uses pymongo's native async API (`AsyncMongoClient`), not Motor — Motor
was deprecated in May 2025 in favor of async support built directly into
PyMongo 4.14+, confirmed against MongoDB's own current docs rather than
assumed. Verified importable and constructible in this sandbox
(`AsyncMongoClient` connects lazily, so construction alone doesn't touch
a network); every actual database operation below is unverified here —
there is no MongoDB server reachable in this sandbox (no server package
in the OS repos, and MongoDB's own package repo is outside the network
allowlist). Every test in this phase exercises storage/memory.py instead,
which implements the identical interface. Treat this file the way the
rest of this project has always treated code it can't run for real:
carefully written against verified current API docs, flagged honestly as
unverified, and worth a real smoke test against an actual database before
this goes anywhere near production.
"""
from datetime import datetime

from pymongo import AsyncMongoClient, ReturnDocument

from storage.base import (
    DuplicateIdempotencyKeyError,
    JobNotFoundError,
    ProjectNotFoundError,
    Repository,
    StorageError,
)
from storage.models import (
    GenerationJob,
    JobStatus,
    Project,
    ProjectPage,
    ProjectSummary,
    is_forward_job_transition,
    utcnow,
)

_JOBS_COLLECTION = "generation_jobs"
_PROJECTS_COLLECTION = "projects"


def _strip_mongo_id(doc: dict) -> dict:
    doc = dict(doc)
    doc.pop("_id", None)
    return doc


class MongoRepository(Repository):
    def __init__(self, database_url: str, database_name: str):
        # tz_aware=True for consistency with storage/gemini_pool_mongo.py —
        # see the comment there. No arithmetic on these particular
        # timestamps today, but keeping both clients' datetime behavior
        # identical avoids the same class of bug resurfacing here later.
        self._client = AsyncMongoClient(database_url, tz_aware=True)
        self._db = self._client[database_name]
        self._jobs = self._db[_JOBS_COLLECTION]
        self._projects = self._db[_PROJECTS_COLLECTION]

    async def ensure_indexes(self) -> None:
        """Called once at startup (main.py). Documented per Section 20 —
        each index exists for a specific query this repository actually
        makes:
        - jobs.jobId: every get/update goes by this (unique — it's the
          logical primary key, not Mongo's own _id).
        - jobs.idempotencyKey: find_job_by_idempotency_key's lookup, and
          the uniqueness constraint Section 17 asks for — sparse because
          most jobs have no idempotency key at all, and a unique index
          would otherwise treat every one of those nulls as a collision.
        - projects.projectId: every get/update goes by this (unique).
        - projects.ownerId + updatedAt (compound): list_projects's exact
          query shape — filter by owner, sorted by recency.
        """
        await self._jobs.create_index("jobId", unique=True)
        await self._jobs.create_index("idempotencyKey", unique=True, sparse=True)
        await self._projects.create_index("projectId", unique=True)
        await self._projects.create_index([("ownerId", 1), ("updatedAt", -1)])

    async def close(self) -> None:
        await self._client.close()

    # --- Generation jobs ---

    async def create_generation_job(self, job: GenerationJob) -> GenerationJob:
        try:
            await self._jobs.insert_one(job.model_dump(mode="json"))
        except Exception as exc:
            if _is_duplicate_key_error(exc) and job.idempotencyKey is not None:
                existing = await self.find_job_by_idempotency_key(job.idempotencyKey)
                if existing is not None:
                    raise DuplicateIdempotencyKeyError(job.idempotencyKey, existing) from exc
            raise StorageError(f"Failed to create generation job: {exc}") from exc
        return job

    async def get_generation_job(self, job_id: str) -> GenerationJob:
        doc = await self._jobs.find_one({"jobId": job_id})
        if doc is None:
            raise JobNotFoundError(job_id)
        return GenerationJob(**_strip_mongo_id(doc))

    async def update_generation_job(self, job_id: str, **updates) -> GenerationJob:
        current = await self.get_generation_job(job_id)
        if "status" in updates and not is_forward_job_transition(current.status, JobStatus(updates["status"])):
            updates = {k: v for k, v in updates.items() if k != "status"}
        updates = {**updates, "updatedAt": utcnow()}
        doc = await self._jobs.find_one_and_update(
            {"jobId": job_id},
            {"$set": _jsonable(updates)},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            raise JobNotFoundError(job_id)
        return GenerationJob(**_strip_mongo_id(doc))

    async def find_job_by_idempotency_key(self, idempotency_key: str) -> GenerationJob | None:
        doc = await self._jobs.find_one({"idempotencyKey": idempotency_key})
        return GenerationJob(**_strip_mongo_id(doc)) if doc else None

    # --- Projects ---

    async def create_project(self, project: Project) -> Project:
        await self._projects.insert_one(project.model_dump(mode="json"))
        return project

    async def get_project(self, project_id: str) -> Project:
        doc = await self._projects.find_one({"projectId": project_id})
        if doc is None:
            raise ProjectNotFoundError(project_id)
        return Project(**_strip_mongo_id(doc))

    async def update_project(self, project_id: str, **updates) -> Project:
        updates = {**updates, "updatedAt": utcnow()}
        doc = await self._projects.find_one_and_update(
            {"projectId": project_id},
            {"$set": _jsonable(updates)},
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            raise ProjectNotFoundError(project_id)
        return Project(**_strip_mongo_id(doc))

    async def list_projects(self, page: int, limit: int, owner_id: str | None = None) -> ProjectPage:
        query = {} if owner_id is None else {"ownerId": owner_id}
        # Projection excludes `files` — Section 34's "never load full
        # content for the list endpoint" enforced at the query level, not
        # by fetching everything and discarding it in Python.
        projection = {"_id": 0, "projectId": 1, "name": 1, "websiteType": 1, "status": 1, "updatedAt": 1}
        cursor = (
            self._projects.find(query, projection)
            .sort("updatedAt", -1)
            .skip((page - 1) * limit)
            .limit(limit)
        )
        docs = await cursor.to_list(None)  # PyMongo Async: to_list(0) is invalid; to_list(None) means "all"
        total = await self._projects.count_documents(query)
        return ProjectPage(
            items=[ProjectSummary(**d) for d in docs],
            page=page,
            limit=limit,
            total=total,
        )


def _jsonable(updates: dict) -> dict:
    """Pydantic enums/datetimes need to become plain BSON-friendly values
    before a $set — pymongo handles datetime natively but not a StrEnum
    member directly in every driver version, so normalize explicitly
    rather than rely on that."""
    result = {}
    for key, value in updates.items():
        if hasattr(value, "value") and not isinstance(value, datetime):
            result[key] = value.value
        else:
            result[key] = value
    return result


def _is_duplicate_key_error(exc: Exception) -> bool:
    return type(exc).__name__ == "DuplicateKeyError"