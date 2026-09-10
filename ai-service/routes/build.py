"""
POST /v1/build/portfolio — Phase 4, Section 17.

Runs the complete Requirements -> Design -> Architecture -> Code
Generation -> Static Validation -> Build -> (Debug -> Patch -> rebuild)*
pipeline. Separate from /v1/generation/portfolio on purpose — that
endpoint's Phase 3 meaning (generate + statically validate, no execution)
stays exactly as it was.
"""
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from dependencies import require_service_auth
from orchestrator.generation_pipeline import GenerationPipeline, PipelineFailure
from routes.planning import PortfolioPlanningRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/build", dependencies=[Depends(require_service_auth)])

_STATUS_BY_CODE = {
    "PROVIDER_FAILURE": 502,
    "SCHEMA_VALIDATION_FAILED": 500,
    "PROJECT_VALIDATION_FAILURE": 500,
    "BUILD_BLOCKED": 422,  # the request's own generated content was unsafe, not a server error
    "BUILD_REPAIR_EXHAUSTED": 500,
    "DEBUG_PATCH_INVALID": 500,
}


@router.post("/portfolio")
async def build_portfolio(payload: PortfolioPlanningRequest):
    pipeline = GenerationPipeline()
    try:
        state = await pipeline.run_with_build(payload.model_dump(mode="json"))
    except PipelineFailure as exc:
        logger.error(
            "build_request_failed",
            extra={"jobId": exc.state.jobId, "stage": exc.stage, "code": exc.code},
        )
        content = {
            "success": False,
            "jobId": exc.state.jobId,
            "error": {"code": exc.code, "stage": exc.stage, "message": exc.message},
        }
        # Section 19: a failed repair loop must return the final build
        # result, the repair attempt count, and the last diagnosis — not
        # just a bare error.
        if exc.state.buildResult is not None:
            content["buildResult"] = exc.state.buildResult
        if exc.state.debugResult is not None:
            content["lastDebugResult"] = exc.state.debugResult
        content["repairAttempts"] = exc.state.repairAttempt
        return JSONResponse(status_code=_STATUS_BY_CODE.get(exc.code, 500), content=content)

    build_output = state.outputs["BUILD"]
    return {
        "jobId": state.jobId,
        "success": True,
        "status": "completed",
        "stage": state.stage.value,
        "project": state.finalProject["project"],
        "files": state.finalProject["files"],
        "buildResult": build_output["buildResult"],
        "repairAttempts": build_output["repairAttempts"],
    }
