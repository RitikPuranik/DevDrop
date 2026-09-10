"""
Ollama provider — local, no API key required. Useful for development
without burning Gemini quota, and keeps the provider abstraction honest
(nothing about AIProvider should assume Gemini's request/response shape).
"""
import json
import logging
from typing import Any

import httpx2

from providers.base import AIProvider, AIProviderError

logger = logging.getLogger(__name__)


class OllamaProvider(AIProvider):
    name = "ollama"

    def __init__(self, settings):
        self._base_url = settings.ollama_base_url.rstrip("/")
        self._model = settings.ollama_model

    @property
    def is_configured(self) -> bool:
        return bool(self._base_url and self._model)

    async def generate(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        response_schema: dict[str, Any] | None = None,
        temperature: float = 0.7,
    ) -> str:
        full_prompt = prompt
        if context:
            full_prompt = f"{prompt}\n\nContext:\n{json.dumps(context, default=str)}"
        if response_schema:
            full_prompt += (
                "\n\nRespond with ONLY valid JSON matching this schema, no other text:\n"
                f"{json.dumps(response_schema)}"
            )

        payload: dict[str, Any] = {
            "model": self._model,
            "prompt": full_prompt,
            "stream": False,
            "options": {"temperature": temperature},
        }
        if response_schema:
            payload["format"] = "json"

        try:
            async with httpx2.AsyncClient(timeout=120) as client:
                resp = await client.post(f"{self._base_url}/api/generate", json=payload)
                resp.raise_for_status()
        except httpx2.HTTPError as exc:
            logger.error("Ollama request failed: %s", exc)
            raise AIProviderError(f"Ollama request failed: {exc}") from exc

        data = resp.json()
        text = data.get("response")
        if not text:
            raise AIProviderError("Ollama returned an empty response.")
        return text
