"""
Centralized configuration for the AI service.

Every environment variable this service reads lives here — nothing else in
the codebase should call `os.environ` / `os.getenv` directly. This is what
Section 5 of the build spec means by "centralize model configuration":
adding a new provider means adding fields here and a new provider class,
not grepping the codebase for a hardcoded model name.
"""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # --- Server ---
    port: int = Field(default=8000, alias="PORT")
    environment: str = Field(default="development", alias="ENVIRONMENT")
    log_level: str = Field(default="info", alias="LOG_LEVEL")

    # --- Provider selection ---
    ai_provider: str = Field(default="gemini", alias="AI_PROVIDER")

    # --- Gemini ---
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str | None = Field(default=None, alias="GEMINI_MODEL")

    # --- Ollama ---
    ollama_base_url: str = Field(default="http://localhost:11434", alias="OLLAMA_BASE_URL")
    ollama_model: str = Field(default="llama3.1", alias="OLLAMA_MODEL")

    # --- Usage limits (Section 21) — enforced starting in a later phase ---
    max_generations_per_day: int = Field(default=5, alias="MAX_GENERATIONS_PER_DAY")
    max_ai_edits_per_day: int = Field(default=20, alias="MAX_AI_EDITS_PER_DAY")
    max_generation_duration_seconds: int = Field(default=600, alias="MAX_GENERATION_DURATION_SECONDS")

    # --- Internal service auth (Section 23) — enforced on internal test/debug
    # endpoints (e.g. /v1/planning/*) once set; full Node<->service auth
    # lands in Phase 6 ---
    service_auth_token: str | None = Field(default=None, alias="SERVICE_AUTH_TOKEN")

    # --- Agent schema validation (Phase 2, Section 7) ---
    max_schema_retries: int = Field(default=2, alias="MAX_SCHEMA_RETRIES")

    # --- Build sandbox + repair loop (Phase 4) ---
    # Renamed from Phase 1's placeholder MAX_BUILD_FIX_RETRIES (never wired
    # to any logic) to the name Phase 4's spec actually uses.
    max_build_repair_attempts: int = Field(default=3, alias="MAX_BUILD_REPAIR_ATTEMPTS")
    build_timeout_seconds: int = Field(default=120, alias="BUILD_TIMEOUT_SECONDS")
    # Documented, not enforced by the local sandbox — see README's Security
    # Model section. A real network boundary needs a container/VM, which
    # the local adapter explicitly is not.
    build_network_mode: str = Field(default="restricted", alias="BUILD_NETWORK_MODE")
    max_build_output_chars: int = Field(default=20_000, alias="MAX_BUILD_OUTPUT_CHARS")

    # --- Persistence (Phase 5) ---
    # No separate backend-selector var: AI_DATABASE_URL unset means "use
    # the in-memory repository" (loud dev-only fallback, see
    # storage/factory.py), set means "use MongoDB". Keeping this implicit
    # avoids a config state where the two could contradict each other.
    ai_database_url: str | None = Field(default=None, alias="AI_DATABASE_URL")
    ai_database_name: str = Field(default="devdrop_ai", alias="AI_DATABASE_NAME")
    default_page_size: int = Field(default=20, alias="DEFAULT_PAGE_SIZE")
    max_page_size: int = Field(default=100, alias="MAX_PAGE_SIZE")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Settings are read once per process and cached — mirrors the Node
    backend reading `process.env` once at require-time rather than on every
    request. Tests that change env vars mid-run call get_settings.cache_clear()
    first."""
    return Settings()
