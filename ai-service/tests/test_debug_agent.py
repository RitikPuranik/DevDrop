"""Debug Agent tests — Phase 4, Section 29."""
import json

import pytest

from agents.base_agent import AgentError
from agents.debug_agent import DebugAgent
from config import Settings
from tests.fakes import FakeProvider, fixed_response_provider


def _settings(max_schema_retries: int = 2) -> Settings:
    return Settings(max_schema_retries=max_schema_retries)


def _valid_debug_payload() -> dict:
    return {
        "diagnosis": "Hero.jsx imports a non-existent module.",
        "rootCause": {
            "category": "import",
            "file": "src/components/Hero.jsx",
            "line": 4,
            "message": "Cannot resolve '../data/doesNotExist.js'",
        },
        "changes": [
            {
                "path": "src/components/Hero.jsx",
                "action": "replace",
                "reason": "Fix incorrect relative import",
                "content": "export default function Hero() { return <section>hi</section> }",
            }
        ],
        "confidence": 0.9,
    }


def _context() -> dict:
    return {
        "architecture": {"project": {"framework": "react-vite"}, "entryPoints": [], "files": []},
        "buildResult": {"exitCode": 1, "stdout": "", "stderr": 'Could not resolve "../data/doesNotExist.js"'},
        "normalizedErrors": [
            {"file": "src/components/Hero.jsx", "message": "unresolved import", "category": "import", "rawMessage": "x"}
        ],
        "affectedFiles": {"src/components/Hero.jsx": "import { siteData } from '../data/doesNotExist.js'"},
    }


async def test_valid_diagnosis():
    provider = fixed_response_provider(_valid_debug_payload())
    agent = DebugAgent(settings=_settings(), provider=provider)

    result = await agent.run(_context())

    assert result.rootCause.category == "import"
    assert len(result.changes) == 1
    assert "$ref" not in json.dumps(provider.calls[0]["response_schema"])


async def test_invalid_diagnosis_retries_then_succeeds():
    provider = FakeProvider(responses=["not json", json.dumps(_valid_debug_payload())])
    agent = DebugAgent(settings=_settings(), provider=provider)

    result = await agent.run(_context())

    assert result is not None
    assert len(provider.calls) == 2


async def test_repair_response_reaches_the_caller_structured():
    provider = fixed_response_provider(_valid_debug_payload())
    agent = DebugAgent(settings=_settings(), provider=provider)

    result = await agent.run(_context())

    assert result.changes[0].path == "src/components/Hero.jsx"
    assert result.confidence == 0.9


async def test_provider_failure_does_not_retry():
    provider = FakeProvider(fail_with="rate limited")
    agent = DebugAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context())

    assert exc_info.value.code == "PROVIDER_FAILURE"
    assert len(provider.calls) == 1


async def test_prompt_includes_normalized_errors_and_affected_files():
    provider = fixed_response_provider(_valid_debug_payload())
    agent = DebugAgent(settings=_settings(), provider=provider)

    await agent.run(_context())

    prompt = provider.calls[0]["prompt"]
    assert "doesNotExist" in prompt
    assert "src/components/Hero.jsx" in prompt
    assert "Prefer 1-3" in prompt
