"""
Common interface every AI provider implements (Section 5 of the build
spec). Orchestrator/agent code in later phases should only ever import
`AIProvider` / `AIProviderError` from here and construct providers through
`providers.factory.get_provider()` — never a concrete provider class
directly. That's what lets a new provider (OpenRouter, Claude, OpenAI) get
added later without touching anything outside providers/.
"""
from abc import ABC, abstractmethod
from typing import Any


class AIProviderError(Exception):
    """Raised for any provider failure — bad config, network error, bad
    response — so calling code can catch one exception type regardless of
    which provider is behind it."""


class AIProvider(ABC):
    name: str = "base"

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """True if this provider has what it needs to make a real call
        (API key present, model name set, etc). Never raises and never
        makes a network call — mirrors githubService.isGithubConfigured()
        in the Node backend: a cheap check callers can use before
        committing to a real request, not a round trip."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        context: dict[str, Any] | None = None,
        response_schema: dict[str, Any] | None = None,
        temperature: float = 0.7,
    ) -> str:
        """Run one generation.

        `context` is arbitrary structured data the caller folds into the
        prompt — later-phase agents pass things like the design system or
        the architecture contract here. When `response_schema` is given,
        implementations constrain the model to return JSON matching it and
        hand back that JSON as a string for the caller to parse.

        Raises AIProviderError on any failure.
        """
