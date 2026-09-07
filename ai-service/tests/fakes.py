"""
Deterministic provider test doubles.

Nothing in the Phase 2 test suite makes a real network call — these fakes
implement the exact same AIProvider interface a real provider does, so
agent/pipeline behavior (schema validation, retries, error codes,
end-to-end chaining) is proven correct independent of what a live Gemini
call would actually return. See README.md's Phase 2 section for what that
means for "genuinely complete."
"""
import json
from typing import Any

from providers.base import AIProvider, AIProviderError


class FakeProvider(AIProvider):
    """Returns pre-scripted responses in call order. Raises AIProviderError
    on every call if `fail_with` is set; raises AssertionError if asked for
    more calls than were scripted (a test bug, not a code-under-test bug)."""

    name = "fake"

    def __init__(self, responses: list[str] | None = None, fail_with: str | None = None):
        self._responses = list(responses or [])
        self._fail_with = fail_with
        self.calls: list[dict[str, Any]] = []

    @property
    def is_configured(self) -> bool:
        return True

    async def generate(
        self,
        prompt: str,
        context: dict | None = None,
        response_schema: dict | None = None,
        temperature: float = 0.7,
    ) -> str:
        self.calls.append(
            {"prompt": prompt, "context": context, "response_schema": response_schema, "temperature": temperature}
        )
        if self._fail_with is not None:
            raise AIProviderError(self._fail_with)
        if not self._responses:
            raise AssertionError("FakeProvider.generate() called more times than responses were scripted.")
        return self._responses.pop(0)


def fixed_response_provider(payload: dict) -> FakeProvider:
    """A FakeProvider that succeeds on the very first attempt with `payload`."""
    return FakeProvider(responses=[json.dumps(payload)])


class FakeSandbox:
    """A BuildSandbox test double — returns pre-scripted BuildResults in
    order, no subprocess or filesystem I/O at all. Used for pipeline-level
    orchestration tests (does the repair loop call things in the right
    order, is it bounded) where re-proving "does npm actually work" would
    just be slow, not more correct — that's what
    tests/test_local_sandbox.py's real integration test is for."""

    def __init__(self, results: list):
        self._results = list(results)
        self.calls: list = []

    async def build(self, project):
        self.calls.append(project)
        if not self._results:
            raise AssertionError("FakeSandbox.build() called more times than results were scripted.")
        return self._results.pop(0)
