"""
GET /health — Phase 1's only endpoint. Shaped like the Node backend's own
GET /health (backend/src/app.js), plus reports whether the configured AI
provider actually has what it needs to run, without making a network call
to check.
"""
from datetime import datetime, timezone

from fastapi import APIRouter

from config import get_settings
from providers.factory import get_provider

router = APIRouter()


@router.get("/health")
async def health():
    settings = get_settings()
    try:
        provider = get_provider(settings)
        provider_status = {"name": provider.name, "configured": provider.is_configured}
    except ValueError as exc:
        provider_status = {"name": settings.ai_provider, "configured": False, "error": str(exc)}

    return {
        "success": True,
        "message": "AI service is running",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "environment": settings.environment,
        "provider": provider_status,
    }
