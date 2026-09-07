"""
get_provider() is the only way orchestrator/agent code (later phases)
should construct a provider. Adding a new one — OpenRouter, Claude, OpenAI
(Section 5) — means one new class in providers/ plus one new line in
_PROVIDERS below; nothing else in the codebase changes.
"""
from config import Settings, get_settings
from providers.base import AIProvider
from providers.gemini import GeminiProvider
from providers.ollama import OllamaProvider

_PROVIDERS: dict[str, type[AIProvider]] = {
    "gemini": GeminiProvider,
    "ollama": OllamaProvider,
}


def get_provider(settings: Settings | None = None) -> AIProvider:
    settings = settings or get_settings()
    name = settings.ai_provider.lower()
    try:
        provider_cls = _PROVIDERS[name]
    except KeyError:
        raise ValueError(
            f"Unknown AI_PROVIDER '{settings.ai_provider}'. Available: {', '.join(sorted(_PROVIDERS))}"
        ) from None
    return provider_cls(settings)
