"""
POST /v1/planning/portfolio — Phase 2, Section 12.

An internal development endpoint for exercising the full
Requirements -> Design -> Architecture pipeline against a real request
shape, ahead of Phase 3 wiring this into DevDrop's actual generation-job
flow. Protected by require_service_auth — see dependencies.py.
"""
import logging

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from dependencies import require_service_auth
from orchestrator.generation_pipeline import GenerationPipeline, PipelineFailure

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/planning", dependencies=[Depends(require_service_auth)])

# HTTP status per failure code — provider trouble is an upstream/gateway
# problem; the model persistently failing to produce valid structured
# output is treated as our own system falling short, not the caller's fault.
_STATUS_BY_CODE = {
    "PROVIDER_FAILURE": 502,
    "SCHEMA_VALIDATION_FAILED": 500,
}


class SocialLinks(BaseModel):
    github: str | None = None
    linkedin: str | None = None


class ProjectInput(BaseModel):
    title: str
    description: str | None = None
    link: str | None = None


class UserData(BaseModel):
    name: str
    role: str
    bio: str | None = None
    skills: list[str] = Field(default_factory=list)
    projects: list[ProjectInput] = Field(default_factory=list)
    socialLinks: SocialLinks = Field(default_factory=SocialLinks)


class Preferences(BaseModel):
    theme: str | None = None
    style: str | None = None
    animations: bool | None = None


class PortfolioPlanningRequest(BaseModel):
    websiteType: str = "portfolio"
    userData: UserData
    preferences: Preferences = Field(default_factory=Preferences)


@router.post("/portfolio")
async def plan_portfolio(payload: PortfolioPlanningRequest):
    pipeline = GenerationPipeline()
    try:
        state = await pipeline.run(payload.model_dump(mode="json"))
    except PipelineFailure as exc:
        logger.error(
            "planning_request_failed",
            extra={"jobId": exc.state.jobId, "stage": exc.stage, "code": exc.code},
        )
        return JSONResponse(
            status_code=_STATUS_BY_CODE.get(exc.code, 500),
            content={
                "success": False,
                "error": {"code": exc.code, "stage": exc.stage, "message": exc.message},
            },
        )

    return {
        "success": True,
        "planning": {
            "requirements": state.outputs.get("REQUIREMENTS"),
            "design": state.outputs.get("DESIGN"),
            "architecture": state.outputs.get("ARCHITECTURE"),
        },
    }
