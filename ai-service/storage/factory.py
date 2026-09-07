"""
Storage factory — Phase 5, Section 27.

No AI_DATABASE_URL configured means "use the in-memory repository" — a
loud, clearly-labeled dev/test fallback, not a silent one. Every call
logs a warning so this can't accidentally go unnoticed in what looks like
a production deployment (the same pattern as SERVICE_AUTH_TOKEN being
unset in dependencies.py).
"""
import logging

from config import Settings, get_settings
from storage.base import Repository
from storage.memory import InMemoryRepository
from storage.mongo import MongoRepository

logger = logging.getLogger(__name__)

_singleton: Repository | None = None
_warned_in_memory = False


def get_repository(settings: Settings | None = None) -> Repository:
    """Returns a process-wide singleton — a repository (especially
    MongoRepository, which owns a client/connection pool) shouldn't be
    reconstructed per request. Tests that need isolation should construct
    an InMemoryRepository directly rather than going through this factory."""
    global _singleton, _warned_in_memory
    if _singleton is not None:
        return _singleton

    settings = settings or get_settings()
    if settings.ai_database_url:
        _singleton = MongoRepository(settings.ai_database_url, settings.ai_database_name)
    else:
        if not _warned_in_memory:
            logger.warning(
                "storage_in_memory_fallback",
                extra={
                    "detail": "AI_DATABASE_URL is not set — using the in-memory repository. "
                    "Generated projects will NOT survive a restart. Set AI_DATABASE_URL for real persistence."
                },
            )
            _warned_in_memory = True
        _singleton = InMemoryRepository()
    return _singleton
