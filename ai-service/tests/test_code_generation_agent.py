"""Code Generation Agent tests — Phase 3, Section 22."""
import copy
import json

import pytest

from agents.base_agent import AgentError
from agents.code_generation_agent import CodeGenerationAgent
from config import Settings
from tests.fakes import FakeProvider, fixed_response_provider


def _settings(max_schema_retries: int = 2) -> Settings:
    return Settings(max_schema_retries=max_schema_retries)


def _context(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload):
    return {
        "requirements": valid_requirements_payload,
        "design": valid_design_payload,
        "architecture": valid_full_architecture_payload,
    }


async def test_valid_structured_response(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    provider = fixed_response_provider(valid_code_generation_payload)
    agent = CodeGenerationAgent(settings=_settings(), provider=provider)

    result = await agent.run(_context(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload))

    assert result.project.framework == "react-vite"
    assert len(result.files) == 13
    assert "$ref" not in json.dumps(provider.calls[0]["response_schema"])


async def test_invalid_structured_response_retries_then_succeeds(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    provider = FakeProvider(responses=["not json", json.dumps(valid_code_generation_payload)])
    agent = CodeGenerationAgent(settings=_settings(), provider=provider)

    result = await agent.run(_context(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload))

    assert result is not None
    assert len(provider.calls) == 2


async def test_provider_failure_does_not_retry(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload
):
    provider = FakeProvider(fail_with="quota exceeded")
    agent = CodeGenerationAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload))

    assert exc_info.value.code == "PROVIDER_FAILURE"
    assert len(provider.calls) == 1


async def test_schema_retry_behavior_is_bounded(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    # A framework the schema will never accept, no matter how many times we retry.
    bad_payload = copy.deepcopy(valid_code_generation_payload)
    bad_payload["project"]["framework"] = "next-js"
    provider = FakeProvider(responses=[json.dumps(bad_payload)] * 3)
    agent = CodeGenerationAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload))

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"
    assert exc_info.value.stage == "CodeGenerationAgent"
    assert len(provider.calls) == 3


async def test_prompt_construction_enforces_tech_constraints(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    provider = fixed_response_provider(valid_code_generation_payload)
    agent = CodeGenerationAgent(settings=_settings(), provider=provider)

    await agent.run(_context(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload))

    prompt = provider.calls[0]["prompt"]
    assert "Next.js" in prompt and "TypeScript" in prompt and "Tailwind" in prompt  # named as forbidden
    assert "TODO" in prompt  # named as a forbidden placeholder marker


async def test_requirements_design_architecture_context_propagation(
    valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    provider = fixed_response_provider(valid_code_generation_payload)
    agent = CodeGenerationAgent(settings=_settings(), provider=provider)

    await agent.run(_context(valid_requirements_payload, valid_design_payload, valid_full_architecture_payload))

    prompt = provider.calls[0]["prompt"]
    # Real content from each of the three upstream stages must actually
    # reach the prompt — not just the input, the *validated output* of
    # each prior agent.
    assert valid_requirements_payload["primaryGoal"] in prompt
    assert valid_design_payload["designSystem"]["theme"] in prompt
    assert "src/components/Hero.jsx" in prompt  # from the architecture file list
