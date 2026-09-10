"""
Gemini Project Pool admin API — Section 20.

Route naming follows this service's existing `/v1/...` convention
(routes/projects.py, routes/jobs.py); "admin" is its own path segment
rather than a separate versioning scheme, since nothing else in this
service has an admin/non-admin split yet. Protected by the same
`require_service_auth` every other route in this internal-only service
uses (Section 27's "separate admin management from normal users" is
satisfied one layer up: this whole service is only ever called by the
DevDrop Node backend, never by the frontend or an end user directly —
see main.py's docstring — so the Node backend's own admin-auth layer is
what actually gates who can reach these routes at all; duplicating a
second, different auth scheme in here would be a second thing to keep in
sync with the Node backend's user/role model, not real defense in depth).

GET /health/summary is registered before GET /{project_id} so it isn't
swallowed by the path-parameter route (FastAPI matches path operations in
registration order).
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from config import get_settings
from dependencies import require_service_auth
from gemini_pool import lifecycle
from gemini_pool.scheduler import GeminiScheduler, budget_state
from storage.factory import get_gemini_pool_repository
from storage.gemini_pool_base import GeminiProjectNotFoundError
from storage.gemini_pool_models import (
    GeminiPoolHealth,
    GeminiProjectCreateRequest,
    GeminiProjectPublic,
    GeminiProjectUpdateRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/admin/gemini-projects", dependencies=[Depends(require_service_auth)])


def _public(record, settings) -> GeminiProjectPublic:
    return GeminiProjectPublic.from_record(record, budget_state(record, settings))


@router.get("")
async def list_gemini_projects():
    settings = get_settings()
    repository = get_gemini_pool_repository(settings)
    records = await repository.list_projects()
    records.sort(key=lambda r: (r.priority, r.createdAt))
    return {
        "success": True,
        "items": [_public(r, settings).model_dump(mode="json") for r in records],
        "total": len(records),
    }


@router.get("/health/summary")
async def gemini_pool_health_summary():
    settings = get_settings()
    repository = get_gemini_pool_repository(settings)
    scheduler = GeminiScheduler(repository, settings)
    health = await scheduler.pool_health()
    return {"success": True, **GeminiPoolHealth(**health).model_dump(mode="json")}


@router.post("", status_code=201)
async def add_gemini_project(payload: GeminiProjectCreateRequest):
    settings = get_settings()
    repository = get_gemini_pool_repository(settings)
    record = await lifecycle.add_project(repository, payload)
    logger.info("gemini_project_added", extra={"projectId": record.id, "projectName": record.name})
    return {"success": True, "project": _public(record, settings).model_dump(mode="json")}


@router.get("/{project_id}")
async def get_gemini_project(project_id: str):
    settings = get_settings()
    repository = get_gemini_pool_repository(settings)
    try:
        record = await repository.get_project(project_id)
    except GeminiProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"success": True, "project": _public(record, settings).model_dump(mode="json")}


@router.patch("/{project_id}")
async def update_gemini_project(project_id: str, payload: GeminiProjectUpdateRequest):
    settings = get_settings()
    repository = get_gemini_pool_repository(settings)

    if payload.status is not None and payload.status not in ("active", "disabled"):
        raise HTTPException(
            status_code=400,
            detail="status must be 'active' or 'disabled' — other statuses are managed by the scheduler itself.",
        )

    try:
        record = await lifecycle.update_project(repository, project_id, payload)
    except GeminiProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except lifecycle.GeminiProjectStillUnhealthyError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    logger.info("gemini_project_updated", extra={"projectId": project_id})
    return {"success": True, "project": _public(record, settings).model_dump(mode="json")}


@router.delete("/{project_id}")
async def remove_gemini_project(project_id: str, purge: bool = Query(default=False)):
    settings = get_settings()
    repository = get_gemini_pool_repository(settings)
    try:
        if purge:
            # Physical delete — Section 4 offers this only as an explicit
            # opt-in; the default DELETE (below) is the soft `remove`
            # every other section of the spec assumes (usage/health
            # history stays queryable, an in-flight request's
            # already-captured credential still finishes normally).
            record = await repository.get_project(project_id)  # 404s cleanly if already gone
            await repository.delete_project(project_id)
        else:
            record = await lifecycle.remove_project(repository, project_id)
    except GeminiProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    logger.info("gemini_project_removed", extra={"projectId": project_id, "purge": purge})
    return {"success": True, "project": _public(record, settings).model_dump(mode="json")}


@router.post("/{project_id}/test")
async def test_gemini_project(project_id: str):
    settings = get_settings()
    repository = get_gemini_pool_repository(settings)
    try:
        result = await lifecycle.test_project(repository, project_id)
    except GeminiProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    logger.info("gemini_project_tested", extra={"projectId": project_id, "success": result.success})
    return {"success": True, "result": result.model_dump(mode="json")}
