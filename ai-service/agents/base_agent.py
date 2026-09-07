"""
Base agent abstraction — Phase 2, Section 2.

Deliberately small: provider retrieval, timing, structured logging, and the
validate/retry-with-repair-prompt flow from Section 7 are common to every
agent, so they live here once. Everything specific to *what* an agent asks
for and *what shape* it expects back stays in that agent's own subclass —
this class has no opinion on website content.
"""
import json
import logging
import time
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, ValidationError

from config import Settings, get_settings
from providers.base import AIProviderError
from providers.factory import get_provider
from schemas.utils import flatten_schema

logger = logging.getLogger(__name__)

# Keeps repair prompts bounded even when an agent's output is large (Phase 3's
# Code Generation Agent can return many files' worth of content) — Phase 2's
# agents never produced enough output to hit this, so their retry behavior is
# unaffected.
_MAX_RAW_OUTPUT_IN_REPAIR_PROMPT = 4000


class AgentError(Exception):
    """Raised when an agent cannot produce a valid result — either the
    provider itself failed, or the model's output never passed schema
    validation within the retry budget. `code` and `stage` let the
    orchestrator build the Section 17 error shape without string-matching
    exception messages."""

    def __init__(self, message: str, *, code: str, stage: str):
        super().__init__(message)
        self.code = code
        self.stage = stage


class BaseAgent(ABC):
    #: Short identifier used in logs and error payloads — e.g. "RequirementsAgent".
    name: str = ""
    #: Sampling temperature for this agent's calls. Planning/contract agents
    #: default low (faithful, low-variance output) — subclasses override
    #: when a bit more variety is actually wanted (e.g. the Design Agent).
    temperature: float = 0.3

    def __init__(self, settings: Settings | None = None, provider: Any = None):
        if not self.name:
            raise TypeError(f"{type(self).__name__} must set a class-level `name`.")
        self._settings = settings or get_settings()
        # `provider` is injectable so tests can supply a fake without any
        # network access — orchestrator/production code always leaves this
        # as None and gets the real configured provider.
        self._provider = provider or get_provider(self._settings)

    @property
    @abstractmethod
    def schema(self) -> type[BaseModel]:
        """The Pydantic model this agent's output must validate against."""

    @abstractmethod
    def build_prompt(self, context: dict) -> str:
        """Build this agent's initial prompt from the pipeline context.
        Each agent pulls only the keys it actually needs."""

    def _build_repair_prompt(self, original_prompt: str, raw_output: str, error: Exception) -> str:
        shown_output = raw_output
        if len(shown_output) > _MAX_RAW_OUTPUT_IN_REPAIR_PROMPT:
            half = _MAX_RAW_OUTPUT_IN_REPAIR_PROMPT // 2
            shown_output = (
                f"{shown_output[:half]}\n"
                f"...[truncated — {len(raw_output)} chars total]...\n"
                f"{shown_output[-half:]}"
            )
        return (
            f"{original_prompt}\n\n"
            "--- YOUR PREVIOUS ATTEMPT FAILED VALIDATION ---\n"
            f"Your previous response was:\n{shown_output}\n\n"
            f"It failed for this reason:\n{error}\n\n"
            "Fix the issue and respond again with ONLY corrected valid JSON "
            "matching the schema. Do not repeat the same mistake."
        )

    async def run(self, context: dict, job_id: str | None = None) -> BaseModel:
        start = time.monotonic()
        log_extra = {"agent": self.name, "jobId": job_id}
        logger.info("agent_started", extra=log_extra)

        schema_dict = flatten_schema(self.schema)
        prompt = self.build_prompt(context)
        last_error: Exception | None = None
        last_raw: str = ""

        max_attempts = self._settings.max_schema_retries + 1
        for attempt in range(1, max_attempts + 1):
            try:
                raw = await self._provider.generate(
                    prompt,
                    response_schema=schema_dict,
                    temperature=self.temperature,
                )
            except AIProviderError as exc:
                duration_ms = round((time.monotonic() - start) * 1000, 1)
                logger.error(
                    "agent_failed",
                    extra={**log_extra, "duration": duration_ms, "status": "failed", "reason": "provider"},
                )
                raise AgentError(str(exc), code="PROVIDER_FAILURE", stage=self.name) from exc

            last_raw = raw
            try:
                parsed = json.loads(raw)
                validated = self.schema.model_validate(parsed)
            except (json.JSONDecodeError, ValidationError) as exc:
                last_error = exc
                logger.warning(
                    "schema_validation_failed",
                    extra={**log_extra, "attempt": attempt, "maxAttempts": max_attempts},
                )
                if attempt < max_attempts:
                    prompt = self._build_repair_prompt(prompt, raw, exc)
                continue

            duration_ms = round((time.monotonic() - start) * 1000, 1)
            logger.info(
                "agent_completed",
                extra={**log_extra, "duration": duration_ms, "status": "completed", "attempts": attempt},
            )
            return validated

        duration_ms = round((time.monotonic() - start) * 1000, 1)
        logger.error(
            "agent_failed",
            extra={**log_extra, "duration": duration_ms, "status": "failed", "reason": "schema"},
        )
        raise AgentError(
            f"{self.name} output failed schema validation after {max_attempts} attempt(s): {last_error}",
            code="SCHEMA_VALIDATION_FAILED",
            stage=self.name,
        ) from last_error
