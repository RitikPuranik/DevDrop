"""
DevDrop AI Service — entrypoint.

Phase 1: FastAPI app, structured logging, GET /health, the provider
abstraction. Phase 2: Requirements -> Design -> Architecture planning
behind POST /v1/planning/portfolio. Phase 3: Code Generation and static
project validation behind POST /v1/generation/portfolio. Phase 4: an
actual sandboxed build plus a bounded debug/patch/rebuild loop, behind
POST /v1/build/portfolio. Phase 5: persistence — POST /v1/generation/jobs
runs the same full pipeline as Phase 4 but records a retrievable job and
project (GET /v1/generation/jobs/{jobId}, GET /v1/projects/{projectId},
GET /v1/projects). Every earlier endpoint keeps its exact prior meaning,
unchanged. GitHub publish, deployment, and DevDrop-core integration are
later phases — see README.md for the roadmap and the Phase 0 findings
this design is based on.

This service is internal-only: it is called by the DevDrop Node backend,
never directly by the frontend (Section 4 / Section 23 rule 1) — so unlike
the Node app there is no CORS middleware here on purpose.

Run with: python -m uvicorn main:app --reload
"""
import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from config import get_settings
from logging_config import configure_logging
from routes.build import router as build_router
from routes.generation import router as generation_router
<<<<<<< HEAD
=======
from routes.gemini_pool_admin import router as gemini_pool_admin_router
>>>>>>> ad5b584213608b50dfd0fcd8acf211a5eeefc4a3
from routes.health import router as health_router
from routes.jobs import router as jobs_router
from routes.planning import router as planning_router
from routes.projects import router as projects_router
<<<<<<< HEAD
from storage.factory import get_repository
=======
from storage.factory import get_gemini_pool_repository, get_repository
from storage.gemini_pool_mongo import MongoGeminiPoolRepository
>>>>>>> ad5b584213608b50dfd0fcd8acf211a5eeefc4a3
from storage.mongo import MongoRepository

configure_logging()
logger = logging.getLogger(__name__)

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    repository = get_repository(settings)
    if isinstance(repository, MongoRepository):
        # Section 20 — indexes are created once at startup, not per
        # request. The in-memory repository has no equivalent concept.
        await repository.ensure_indexes()
        logger.info("mongo_indexes_ensured")
<<<<<<< HEAD
=======

    gemini_pool_repository = get_gemini_pool_repository(settings)
    if isinstance(gemini_pool_repository, MongoGeminiPoolRepository):
        await gemini_pool_repository.ensure_indexes()
        logger.info("gemini_pool_mongo_indexes_ensured")
    if settings.gemini_pool_enabled:
        # Section 4/26: a legacy GEMINI_API_KEY/GEMINI_MODEL becomes one
        # pool entry the first time the pool is turned on, so enabling it
        # never means losing a credential that already worked. No-op once
        # the pool has any project at all — see
        # gemini_pool/lifecycle.py:ensure_legacy_credential_migrated.
        from gemini_pool.lifecycle import ensure_legacy_credential_migrated

        await ensure_legacy_credential_migrated(gemini_pool_repository, settings)
>>>>>>> ad5b584213608b50dfd0fcd8acf211a5eeefc4a3
    yield


app = FastAPI(
    title="DevDrop AI Service",
    description="Internal microservice for AI website generation — called only by the DevDrop Node backend.",
    version="0.1.0",
    docs_url="/docs" if not settings.is_production else None,
    redoc_url=None,
    lifespan=lifespan,
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000, 1)
    if request.url.path != "/health":
        logger.info(
            "%s %s -> %s",
            request.method,
            request.url.path,
            response.status_code,
            extra={"duration_ms": duration_ms, "status_code": response.status_code},
        )
    return response


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    # Without this, a raised HTTPException (e.g. the 401 from
    # require_service_auth) falls through to Starlette's own default
    # handler and comes back as {"detail": "..."} — a second error shape
    # the Node backend would need to special-case.
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "message": str(exc.detail), "code": f"HTTP_{exc.status_code}"},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "success": False,
            "message": "Invalid request body.",
            "code": "VALIDATION_ERROR",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Mirrors the Node backend's global error shape
    # (backend/src/shared/middleware/errorHandler.js) so the Node service
    # that calls this API doesn't need a second error format to translate.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "Internal server error", "code": "AI_SERVICE_ERROR"},
    )


app.include_router(health_router)
app.include_router(planning_router)
app.include_router(generation_router)
app.include_router(build_router)
app.include_router(jobs_router)
app.include_router(projects_router)
<<<<<<< HEAD
=======
app.include_router(gemini_pool_admin_router)
>>>>>>> ad5b584213608b50dfd0fcd8acf211a5eeefc4a3
