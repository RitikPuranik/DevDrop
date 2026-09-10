"""
get_provider() is the only way orchestrator/agent code (later phases)
should construct a provider. Adding a new one — OpenRouter, Claude, OpenAI
(Section 5) — means one new class in providers/ plus one new line in
_PROVIDERS below; nothing else in the codebase changes.
"""
from config import Settings, get_settings
from providers.base import AIProvider
from providers.gemini import GeminiProvider
from providers.gemini_pool_provider import GeminiPooledProvider
from providers.ollama import OllamaProvider

_PROVIDERS: dict[str, type[AIProvider]] = {
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}


def get_provider(settings: Settings | None = None) -> AIProvider:
    settings = settings or get_settings()
    name = settings.ai_provider.lower()

    # Gemini Project Pool (opt-in): GEMINI_POOL_ENABLED=true routes every
    # Gemini call through GeminiScheduler instead of the single-key
    # GeminiProvider — everything above this factory (agents,
    # orchestrator) is unaffected either way, since both implement the
    # same AIProvider interface. Default False keeps every existing
    # deployment's behavior byte-for-byte identical; this is the only
    # branch in the whole feature that isn't purely additive to this file.
    if name == "gemini" and settings.gemini_pool_enabled:
        return GeminiPooledProvider(settings)

    try:
        provider_cls = _PROVIDERS[name]
    except KeyError:
        raise ValueError(
            f"Unknown AI_PROVIDER '{settings.ai_provider}'. Available: {', '.join(sorted(_PROVIDERS))}"
        ) from None
    return provider_cls(settings)