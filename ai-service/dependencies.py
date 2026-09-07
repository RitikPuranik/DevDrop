"""
Shared FastAPI dependencies.

Currently just the internal-service-auth check used by debug/test
endpoints (Phase 2, Section 12). Kept separate from routes/ so any future
protected endpoint reuses this instead of re-implementing it.
"""
import logging

from fastapi import Header, HTTPException

from config import get_settings

logger = logging.getLogger(__name__)
_warned_unprotected = False


async def require_service_auth(x_service_auth: str | None = Header(default=None)) -> None:
    """Guards internal test/debug endpoints with a shared-secret header.

    If SERVICE_AUTH_TOKEN isn't set, the endpoint stays open — logged once,
    not on every request — so local development (this is explicitly an
    "internal development endpoint" per spec Section 12) isn't blocked on
    a secret nothing else needs yet. Full Node<->service auth on the real
    generation endpoints is Phase 6.
    """
    settings = get_settings()
    if not settings.service_auth_token:
        global _warned_unprotected
        if not _warned_unprotected:
            logger.warning(
                "internal_endpoint_unprotected",
                extra={"detail": "SERVICE_AUTH_TOKEN is not set — internal endpoints are open."},
            )
            _warned_unprotected = True
        return
    if x_service_auth != settings.service_auth_token:
        raise HTTPException(status_code=401, detail="Missing or invalid X-Service-Auth header.")
