"""
The one real Gemini network call this whole package makes.

Deliberately tiny and swappable: providers/gemini_pool_provider.py (real
requests) and gemini_pool/lifecycle.py (POST .../test's minimal request)
both take a `caller` parameter defaulting to `call_gemini_api` below.
Tests inject a fake `GeminiCaller` instead, so nothing in gemini_pool/ or
providers/gemini_pool_provider.py needs real network access or a real API
key to be exercised — Section 30's "do not make CI depend on Gemini
being online."

Mirrors providers/gemini.py's own request shape (prompt/context join,
`config` dict keys) on purpose — this is the pool's per-project
equivalent of that single-key provider's request-building, and keeping
the two in lockstep (rather than each growing its own subtly-different
version) is why this exists as one function both could in principle
share, rather than being duplicated inline in the pooled provider.
"""
from dataclasses import dataclass
from typing import Any, Protocol

_EMPTY_RESPONSE_MESSAGE = "Gemini returned an empty response."


class GeminiEmptyResponseError(Exception):
    """Raised when Gemini responds successfully (no APIError) but with no
    text — almost always a safety/content block on this specific prompt,
    not a project/credential problem. gemini_pool/errors.py classifies
    this as APPLICATION_ERROR specifically so it doesn't burn through the
    rest of the pool (Section 16)."""


@dataclass
class GeminiCallResult:
    text: str
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


class GeminiCaller(Protocol):
    async def __call__(
        self,
        *,
        api_key: str,
        model: str,
        prompt: str,
        context: dict[str, Any] | None,
        response_schema: dict[str, Any] | None,
        temperature: float,
        timeout_ms: int,
    ) -> GeminiCallResult: ...


async def call_gemini_api(
    *,
    api_key: str,
    model: str,
    prompt: str,
    context: dict[str, Any] | None = None,
    response_schema: dict[str, Any] | None = None,
    temperature: float = 0.7,
    timeout_ms: int = 60_000,
) -> GeminiCallResult:
    import json

    from google import genai

    full_prompt = prompt
    if context:
        full_prompt = f"{prompt}\n\nContext:\n{json.dumps(context, default=str)}"

    config: dict[str, Any] = {
        "temperature": temperature,
        # Gemini 3 models share ONE token budget between internal
        # "thinking" and the actual visible output — with no explicit
        # cap, a large multi-file code-generation response can run the
        # model out of budget mid-way through, and it silently returns a
        # smaller-but-still-schema-valid result (fewer files) instead of
        # an error. There's no per-agent signal here for how big a given
        # response should be, so this uses one generous ceiling
        # (65536 — the practical max for current flash-tier models) for
        # every call; agents that need far less naturally stop early via
        # their own STOP finish_reason; this only raises the ceiling for
        # ones that need more, most importantly CodeGenerationAgent.
        "max_output_tokens": 65536,
        "http_options": {"timeout": timeout_ms},
    }
    if response_schema:
        config["response_mime_type"] = "application/json"
        config["response_schema"] = response_schema

    client = genai.Client(api_key=api_key)
    response = await client.aio.models.generate_content(model=model, contents=full_prompt, config=config)

    if not response.text:
        raise GeminiEmptyResponseError(_EMPTY_RESPONSE_MESSAGE)

    usage = getattr(response, "usage_metadata", None)
    return GeminiCallResult(
        text=response.text,
        input_tokens=getattr(usage, "prompt_token_count", None) if usage else None,
        output_tokens=getattr(usage, "candidates_token_count", None) if usage else None,
        total_tokens=getattr(usage, "total_token_count", None) if usage else None,
    )