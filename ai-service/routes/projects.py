"""
Project routes — Phase 5, Sections 12, 14-15.

GET /{projectId} returns the full normalized project (metadata + files).
GET / lists projects, metadata only (Section 34 — never full file
content), with bounded pagination: `page`/`limit` reject negative, zero,
or non-integer values outright (FastAPI's own Query validation, which
already comes back in this service's {success, message, code} shape via
main.py's RequestValidationError handler); a `limit` above
MAX_PAGE_SIZE is clamped rather than rejected — an oversized request
isn't malformed, it just needs a decided cap.
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from config import get_settings
from dependencies import require_service_auth
from storage.base import ProjectNotFoundError
from storage.factory import get_repository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/projects", dependencies=[Depends(require_service_auth)])


@router.get("/{project_id}")
async def get_project(project_id: str):
    try:
        project = await get_repository().get_project(project_id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    logger.info("project_retrieved", extra={"projectId": project_id})
    return {
        "success": True,
        "projectId": project.projectId,
        "name": project.name,
        "status": project.status.value,
        "project": {
            "framework": project.framework,
            "language": project.language,
            "styling": project.styling,
        },
        "files": [f.model_dump() for f in project.files],
        "entryPoints": project.entryPoints,
        "directories": project.directories,
    }


@router.get("")
async def list_projects(
    page: int = Query(default=1, ge=1),
    limit: int | None = Query(default=None, ge=1),
    owner_id: str | None = Query(default=None, alias="ownerId"),
):
    settings = get_settings()
    effective_limit = min(limit or settings.default_page_size, settings.max_page_size)

    result = await get_repository().list_projects(page=page, limit=effective_limit, owner_id=owner_id)

    return {
        "success": True,
        "items": [item.model_dump(mode="json") for item in result.items],
        "page": result.page,
        "limit": result.limit,
        "total": result.total,
    }
