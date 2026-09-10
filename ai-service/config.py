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

<<<<<<< HEAD
=======
    # --- Gemini Project Pool ---
    # Opt-in on purpose: default False means every existing deployment
    # (and test_provider_factory_gemini, which constructs a plain
    # Settings() and expects a plain GeminiProvider back) keeps its exact
    # current behavior. Set true once at least one project has been added
    # to the pool (via POST /v1/admin/gemini-projects, or let the
    # provider auto-migrate GEMINI_API_KEY/GEMINI_MODEL into a single
    # pool entry the first time it runs — see
    # gemini_pool/lifecycle.py:ensure_legacy_credential_migrated).
    gemini_pool_enabled: bool = Field(default=False, alias="GEMINI_POOL_ENABLED")
    # Bounds Section 17's failover loop: this many *additional* projects
    # are tried after the first, so total attempts per request = this + 1.
    gemini_max_project_failovers: int = Field(default=2, alias="GEMINI_MAX_PROJECT_FAILOVERS")
    # Used when a caller doesn't pin a specific model — currently no
    # caller does (agents just call ai_gateway.generate(), Section 32),
    # so this is what selects which pool entries are eligible for every
    # request today. A future caller could pass a model explicitly
    # without any other code changing.
    gemini_default_model: str | None = Field(default=None, alias="GEMINI_DEFAULT_MODEL")
    gemini_request_timeout_ms: int = Field(default=60_000, alias="GEMINI_REQUEST_TIMEOUT_MS")
    gemini_cooldown_default_ms: int = Field(default=30_000, alias="GEMINI_COOLDOWN_DEFAULT_MS")
    gemini_cooldown_max_ms: int = Field(default=15 * 60_000, alias="GEMINI_COOLDOWN_MAX_MS")
    gemini_budget_guard_enabled: bool = Field(default=True, alias="GEMINI_BUDGET_GUARD_ENABLED")
    gemini_budget_warning_threshold: float = Field(default=0.7, alias="GEMINI_BUDGET_WARNING_THRESHOLD")
    gemini_budget_critical_threshold: float = Field(default=0.9, alias="GEMINI_BUDGET_CRITICAL_THRESHOLD")
    # How long a reservation holds a project before it's treated as an
    # abandoned/crashed worker's lease and freed automatically (Section 15).
    gemini_lease_ttl_seconds: int = Field(default=120, alias="GEMINI_LEASE_TTL_SECONDS")
    # See gemini_pool/scheduler.py's next_daily_boundary — Section 12
    # explicitly warns against assuming a reset timezone without
    # verifying it against Gemini's current documented behavior. This is
    # a deliberately-conservative placeholder (UTC midnight), not a
    # verified claim; confirm before relying on it in production. See
    # docs/GEMINI_PROJECT_POOL.md.
    gemini_daily_reset_hour_utc: int = Field(default=0, alias="GEMINI_DAILY_RESET_HOUR_UTC")
    # A rough chars-per-token constant for the pre-request token estimate
    # the scheduler uses for TPM eligibility/scoring (Section 11) — not a
    # real tokenizer call, which would mean a second network round trip
    # per request just to estimate the first one. Corrected to Gemini's
    # own reported usage_metadata token counts after every real call.
    gemini_estimated_chars_per_token: float = Field(default=4.0, alias="GEMINI_ESTIMATED_CHARS_PER_TOKEN")
    gemini_estimated_output_tokens: int = Field(default=2000, alias="GEMINI_ESTIMATED_OUTPUT_TOKENS")
    # Internal cost-estimate rates for the budget guard (Section 13) — 0
    # means "don't estimate cost," which effectively disables budget
    # tracking for monthlyUsage even if a monthlyBudget is configured on
    # a project (documented in docs/GEMINI_PROJECT_POOL.md: this is
    # always an estimate, never Google's authoritative billing).
    gemini_estimated_cost_per_1k_input_tokens: float = Field(default=0.0, alias="GEMINI_COST_PER_1K_INPUT_TOKENS")
    gemini_estimated_cost_per_1k_output_tokens: float = Field(default=0.0, alias="GEMINI_COST_PER_1K_OUTPUT_TOKENS")

>>>>>>> ad5b584213608b50dfd0fcd8acf211a5eeefc4a3
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
