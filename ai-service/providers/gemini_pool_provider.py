"""
GeminiPooledProvider — Section 32: the only place agents' calls actually
touch the pool, and they don't know it. An agent (agents/base_agent.py)
calls `providers.factory.get_provider(settings)` and then
`provider.generate(...)`, exactly as it always has for the plain
single-key GeminiProvider — this class implements the same `AIProvider`
interface, so nothing above `providers.factory` changes at all.

`providers/factory.py` only ever constructs this class when
GEMINI_POOL_ENABLED=true; otherwise agents keep getting the existing
GeminiProvider unchanged. See that module for the exact switch.
"""
import asyncio
import json
import logging
import os
import socket
import uuid
from typing import Any

from gemini_pool.errors import ERROR_CLASS_META, classify_gemini_error, scrub_secret
from gemini_pool.gemini_client import GeminiCaller, call_gemini_api
from gemini_pool.scheduler import GeminiPoolExhaustedError, GeminiScheduler
from providers.base import AIProvider, AIProviderError
from storage.factory import get_gemini_pool_repository

logger = logging.getLogger(__name__)

# One id per process, not per request — this is what lets the lease
# mechanism (Section 15) tell "still held by the worker that's actively
# using it" apart from "held by a worker that no longer exists," and what
# storage/gemini_pool_*.py's `reserve()` compares a lease's `leaseOwner`
# against.
_WORKER_ID = f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:8]}"


class GeminiPooledProvider(AIProvider):
    name = "gemini"

    def __init__(self, settings, *, repository=None, caller: GeminiCaller = call_gemini_api):
        self._settings = settings
        self._repository = repository or get_gemini_pool_repository(settings)
        self._scheduler = GeminiScheduler(self._repository, settings)
        self._caller = caller

    @property
    def is_configured(self) -> bool:
        # Deliberately shallow — AIProvider.is_configured's contract is
        # "never makes a network call," and the real answer ("is there at
        # least one eligible project right now") lives behind an async
        # repository read this sync property can't perform. This is "the
        # pool subsystem is turned on," not "the pool currently has
        # capacity" — for the latter, see GET
        # /v1/admin/gemini-projects/health/summary.
        return bool(self._settings.gemini_pool_enabled)

    async def generate(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        response_schema: dict[str, Any] | None = None,
        temperature: float = 0.7,
    ) -> str:
        if not self.is_configured:
            raise AIProviderError("Gemini project pool is not enabled — set GEMINI_POOL_ENABLED=true.")

        requested_model = self._settings.gemini_default_model
        input_tokens, output_tokens, estimated_total_tokens = self._estimate_tokens(prompt, context, response_schema)

        attempted_project_ids: set[str] = set()
        last_error: Exception | None = None
        max_attempts = self._settings.gemini_max_project_failovers + 1

        for attempt in range(1, max_attempts + 1):
            try:
                credential = await self._scheduler.select_and_reserve(
                    requested_model=requested_model,
                    estimated_total_tokens=estimated_total_tokens,
                    attempted_project_ids=attempted_project_ids,
                    worker_id=_WORKER_ID,
                )
            except GeminiPoolExhaustedError as exc:
                # Section 24: a clean, structured provider-unavailable
                # signal — this becomes an AgentError -> PipelineFailure
                # -> a 502 with a real message via the existing error
                # path (routes/*.py), not an unexplained 500.
                raise AIProviderError(str(exc)) from exc

            attempted_project_ids.add(credential.id)

            try:
                result = await asyncio.wait_for(
                    self._caller(
                        api_key=credential.credentialReference,
                        model=credential.model,
                        prompt=prompt,
                        context=context,
                        response_schema=response_schema,
                        temperature=temperature,
                        timeout_ms=self._settings.gemini_request_timeout_ms,
                    ),
                    # The caller already enforces gemini_request_timeout_ms
                    # itself (via http_options); this outer bound is only a
                    # backstop against a caller implementation (real or, in
                    # tests, fake) that doesn't honor it.
                    timeout=(self._settings.gemini_request_timeout_ms / 1000) + 5,
                )
            except Exception as exc:
                error_class = classify_gemini_error(exc)
                await self._scheduler.record_result(
                    credential.id,
                    success=False,
                    estimated_total_tokens=estimated_total_tokens,
                    error=exc,
                    error_class=error_class,
                    credential_reference=credential.credentialReference,
                )
                last_error = exc
                if not ERROR_CLASS_META[error_class].failover:
                    # APPLICATION_ERROR — Section 16: don't try another
                    # project for the exact same bad prompt.
                    raise AIProviderError(
                        f"Gemini request failed: "
                        f"{scrub_secret(str(exc), credential.credentialReference)}"
                    ) from exc
                logger.warning(
                    "gemini.failover",
                    extra={"projectId": credential.id, "attempt": attempt, "errorClass": error_class.value},
                )
                continue

            actual_total_tokens = result.total_tokens
            if actual_total_tokens is None and (result.input_tokens is not None or result.output_tokens is not None):
                actual_total_tokens = (result.input_tokens or 0) + (result.output_tokens or 0)

            await self._scheduler.record_result(
                credential.id,
                success=True,
                estimated_total_tokens=estimated_total_tokens,
                actual_total_tokens=actual_total_tokens,
                cost_delta=self._estimate_cost(result.input_tokens, result.output_tokens),
            )
            return result.text

        raise AIProviderError(
            f"Gemini request failed after {max_attempts} project attempt(s): "
            f"{scrub_secret(str(last_error), None) if last_error else 'unknown error'}"
        ) from last_error

    def _estimate_tokens(
        self, prompt: str, context: dict[str, Any] | None, response_schema: dict[str, Any] | None
    ) -> tuple[int, int, int]:
        """A rough chars-per-token heuristic (Section 11) — not a real
        tokenizer call, which would cost a second network round trip just
        to estimate the first one. Corrected to Gemini's own reported
        `usage_metadata` token counts once the real call completes (see
        `record_result`'s `actual_total_tokens` above)."""
        char_count = len(prompt)
        if context:
            char_count += len(json.dumps(context, default=str))
        if response_schema:
            char_count += len(json.dumps(response_schema, default=str))
        input_tokens = max(1, int(char_count / self._settings.gemini_estimated_chars_per_token))
        output_tokens = self._settings.gemini_estimated_output_tokens
        return input_tokens, output_tokens, input_tokens + output_tokens

    def _estimate_cost(self, input_tokens: int | None, output_tokens: int | None) -> float:
        """Section 13: always an internal estimate, never Google's
        authoritative billing — returns 0.0 (no-op for the budget guard)
        whenever the guard is off or no cost-per-token rate is configured,
        rather than silently guessing a number that looks authoritative."""
        if not self._settings.gemini_budget_guard_enabled:
            return 0.0
        input_tokens = input_tokens or 0
        output_tokens = output_tokens or 0
        return (
            (input_tokens / 1000) * self._settings.gemini_estimated_cost_per_1k_input_tokens
            + (output_tokens / 1000) * self._settings.gemini_estimated_cost_per_1k_output_tokens
        )
