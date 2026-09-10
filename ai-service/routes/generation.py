"""
POST /v1/generation/portfolio — Phase 3, Section 13.

Runs the full Requirements -> Design -> Architecture -> Code Generation ->
Project Validation pipeline. Deliberately a new, separate endpoint —
POST /v1/planning/portfolio keeps its exact Phase 2 meaning (planning
only, no code), rather than silently growing extra steps.
"""
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from dependencies import require_service_auth
from orchestrator.generation_pipeline import GenerationPipeline, PipelineFailure
from routes.planning import PortfolioPlanningRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/generation", dependencies=[Depends(require_service_auth)])

_STATUS_BY_CODE = {
    "PROVIDER_FAILURE": 502,
    "SCHEMA_VALIDATION_FAILED": 500,
    "PROJECT_VALIDATION_FAILURE": 500,
}


@router.post("/portfolio")
async def generate_portfolio(payload: PortfolioPlanningRequest):
    pipeline = GenerationPipeline()
    try:
        state = await pipeline.run_full(payload.model_dump(mode="json"))
    except PipelineFailure as exc:
        logger.error(
            "generation_request_failed",
            extra={"jobId": exc.state.jobId, "stage": exc.stage, "code": exc.code},
        )
        return JSONResponse(
            status_code=_STATUS_BY_CODE.get(exc.code, 500),
            content={
                "success": False,
                "error": {"code": exc.code, "stage": exc.stage, "message": exc.message},
            },
        )

    project_validation = state.outputs["PROJECT_VALIDATION"]
    manifest = project_validation["manifest"]
    return {
        "jobId": state.jobId,
        "success": True,
        "status": "completed",
        "stage": state.stage.value,
        "project": manifest["project"],
        "files": manifest["files"],
        "validation": project_validation["validation"],
    }
