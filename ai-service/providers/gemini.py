"""
Gemini provider — Section 5 / Phase 1.

Uses the `google-genai` SDK (the current unified client for the Gemini API;
the older `google-generativeai` package is deprecated — see
https://ai.google.dev/gemini-api/docs/migrate).
"""
import json
import logging
from typing import Any

from google import genai

from providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)


class GeminiProvider(AIProvider):
    name = "gemini"

    def __init__(self, settings):
        self._api_key = settings.gemini_api_key
        self._model = settings.gemini_model
        self._client = genai.Client(api_key=self._api_key) if self._api_key else None

    @property
    def is_configured(self) -> bool:
        return bool(self._api_key and self._model)

    async def generate(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        response_schema: dict[str, Any] | None = None,
        temperature: float = 0.7,
    ) -> str:
        if not self.is_configured:
            raise AIProviderError(
                "Gemini provider is not configured — set GEMINI_API_KEY and GEMINI_MODEL."
            )

        full_prompt = prompt
        if context:
            full_prompt = f"{prompt}\n\nContext:\n{json.dumps(context, default=str)}"

        config: dict[str, Any] = {
            # See gemini_pool/gemini_client.py's identical comment: without
            # an explicit cap, Gemini 3 models can silently return a
            # truncated-but-valid response (fewer files/fields) once their
            # shared thinking+output token budget runs out, rather than
            # erroring. This mirrors that file's ceiling to keep the two
            # request-building paths in lockstep.
            "temperature": temperature,
            "max_output_tokens": 65536,
        }
        if response_schema:
            config["response_mime_type"] = "application/json"
            config["response_schema"] = response_schema

        try:
            response = await self._client.aio.models.generate_content(
                model=self._model,
                contents=full_prompt,
                config=config,
            )
        except Exception as exc:  # SDK exception types vary by version —
            # normalize everything to AIProviderError so callers only ever
            # handle one exception type regardless of provider.
            logger.error("Gemini request failed: %s", exc)
            raise AIProviderError(f"Gemini request failed: {exc}") from exc

        if not response.text:
            raise AIProviderError("Gemini returned an empty response.")
        return response.text