"""
Generation job routes — Phase 5, Sections 8, 13.

POST creates a job and runs the pipeline synchronously (Section 9 — no
async worker yet), returning the job's final state either way: a job
that settled as `failed` is still a successful API call (we correctly
created and processed the job), so this never maps a generation failure
to a 4xx/5xx — the outcome lives in the response body's `status` field.
GET retrieves a previously-created job by id.
"""
import logging

from fastapi import APIRouter, Depends, Header, HTTPException

from dependencies import require_service_auth
from routes.planning import PortfolioPlanningRequest
from services.generation_service import GenerationService
from storage.base import JobNotFoundError
from storage.factory import get_repository

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/generation/jobs", dependencies=[Depends(require_service_auth)])


def _job_response(job) -> dict:
    return {
        "jobId": job.jobId,
        "projectId": job.projectId,
        "status": job.status.value,
        "currentStage": job.currentStage,
        "repairAttempts": job.repairAttempts,
        "failureCode": job.failureCode,
        "failureMessage": job.failureMessage,
        "createdAt": job.createdAt.isoformat(),
        "updatedAt": job.updatedAt.isoformat(),
        "completedAt": job.completedAt.isoformat() if job.completedAt else None,
    }


@router.post("", status_code=201)
async def create_generation_job(
    payload: PortfolioPlanningRequest,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    owner_id: str | None = Header(default=None, alias="X-Owner-Id"),
):
    service = GenerationService(repository=get_repository())
    job = await service.create_and_run(
        payload.model_dump(mode="json"), idempotency_key=idempotency_key, owner_id=owner_id
    )
    return {"success": True, **_job_response(job)}


@router.get("/{job_id}")
async def get_generation_job(job_id: str):
    try:
        job = await get_repository().get_generation_job(job_id)
    except JobNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"success": True, **_job_response(job)}
