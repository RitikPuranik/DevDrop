"""Design Agent tests — Phase 2, Section 13."""
import json

import pytest

from agents.base_agent import AgentError
from agents.design_agent import DesignAgent
from config import Settings
from tests.fakes import FakeProvider, fixed_response_provider


def _settings(max_schema_retries: int = 2) -> Settings:
    return Settings(max_schema_retries=max_schema_retries)


async def test_valid_requirements_produce_a_design(valid_requirements_payload, valid_design_payload):
    provider = fixed_response_provider(valid_design_payload)
    agent = DesignAgent(settings=_settings(), provider=provider)
    context = {"requirements": valid_requirements_payload, "preferences": {"theme": "dark"}}

    result = await agent.run(context)

    assert result.designSystem.theme == "dark"
    assert "$ref" not in json.dumps(provider.calls[0]["response_schema"])


async def test_dark_theme_preference_reaches_the_prompt(valid_requirements_payload, valid_design_payload):
    provider = fixed_response_provider(valid_design_payload)
    agent = DesignAgent(settings=_settings(), provider=provider)
    context = {"requirements": valid_requirements_payload, "preferences": {"theme": "dark"}}

    await agent.run(context)

    assert '"theme": "dark"' in provider.calls[0]["prompt"]


async def test_light_theme_preference_reaches_the_prompt(valid_requirements_payload, valid_design_payload):
    provider = fixed_response_provider(valid_design_payload)
    agent = DesignAgent(settings=_settings(), provider=provider)
    context = {"requirements": valid_requirements_payload, "preferences": {"theme": "light"}}

    await agent.run(context)

    assert '"theme": "light"' in provider.calls[0]["prompt"]


async def test_invalid_json_retries_then_succeeds(valid_requirements_payload, valid_design_payload):
    provider = FakeProvider(responses=["<<<not json>>>", json.dumps(valid_design_payload)])
    agent = DesignAgent(settings=_settings(), provider=provider)
    context = {"requirements": valid_requirements_payload, "preferences": {}}

    result = await agent.run(context)

    assert result is not None
    assert len(provider.calls) == 2


async def test_schema_failure_bad_hex_color_exhausts_retries(valid_requirements_payload, valid_design_payload):
    bad_payload = json.loads(json.dumps(valid_design_payload))
    bad_payload["designSystem"]["colors"]["primary"] = "purple"  # not a hex code
    provider = FakeProvider(responses=[json.dumps(bad_payload)] * 3)
    agent = DesignAgent(settings=_settings(max_schema_retries=2), provider=provider)
    context = {"requirements": valid_requirements_payload, "preferences": {}}

    with pytest.raises(AgentError) as exc_info:
        await agent.run(context)

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"
    assert exc_info.value.stage == "DesignAgent"
    assert len(provider.calls) == 3


async def test_provider_failure_does_not_retry(valid_requirements_payload):
    provider = FakeProvider(fail_with="upstream timeout")
    agent = DesignAgent(settings=_settings(max_schema_retries=2), provider=provider)
    context = {"requirements": valid_requirements_payload, "preferences": {}}

    with pytest.raises(AgentError) as exc_info:
        await agent.run(context)

    assert exc_info.value.code == "PROVIDER_FAILURE"
    assert len(provider.calls) == 1
