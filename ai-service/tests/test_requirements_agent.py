"""Requirements Agent tests — Phase 2, Section 13."""
import json

import pytest

from agents.base_agent import AgentError
from agents.requirements_agent import RequirementsAgent
from config import Settings
from tests.fakes import FakeProvider, fixed_response_provider


def _settings(max_schema_retries: int = 2) -> Settings:
    return Settings(max_schema_retries=max_schema_retries)


async def test_valid_portfolio_input(portfolio_input, valid_requirements_payload):
    provider = fixed_response_provider(valid_requirements_payload)
    agent = RequirementsAgent(settings=_settings(), provider=provider)

    result = await agent.run(portfolio_input, job_id="job-1")

    assert result.websiteType == "portfolio"
    assert len(provider.calls) == 1
    # The provider must receive the flattened schema, not raw pydantic $refs.
    assert "$ref" not in json.dumps(provider.calls[0]["response_schema"])


async def test_optional_bio_missing_does_not_break_the_agent(valid_requirements_payload):
    provider = fixed_response_provider(valid_requirements_payload)
    agent = RequirementsAgent(settings=_settings(), provider=provider)
    context = {
        "websiteType": "portfolio",
        "userData": {"name": "Alex", "role": "Designer"},  # no "bio" key at all
        "preferences": {},
    }

    result = await agent.run(context)

    assert result.websiteType == "portfolio"


async def test_missing_optional_profile_image_does_not_break_the_agent(valid_requirements_payload):
    provider = fixed_response_provider(valid_requirements_payload)
    agent = RequirementsAgent(settings=_settings(), provider=provider)
    context = {
        "websiteType": "portfolio",
        "userData": {"name": "Alex", "role": "Designer"},  # no profileImage anywhere
        "preferences": {},
    }

    result = await agent.run(context)

    assert result is not None


async def test_multiple_projects_reach_the_prompt(valid_requirements_payload):
    provider = fixed_response_provider(valid_requirements_payload)
    agent = RequirementsAgent(settings=_settings(), provider=provider)
    context = {
        "websiteType": "portfolio",
        "userData": {
            "name": "Alex",
            "role": "Designer",
            "projects": [
                {"title": "Alpha", "description": "First project"},
                {"title": "Beta", "description": "Second project"},
                {"title": "Gamma", "description": "Third project"},
            ],
        },
        "preferences": {},
    }

    await agent.run(context)

    prompt = provider.calls[0]["prompt"]
    assert "Alpha" in prompt and "Beta" in prompt and "Gamma" in prompt


async def test_social_links_reach_the_prompt(valid_requirements_payload):
    provider = fixed_response_provider(valid_requirements_payload)
    agent = RequirementsAgent(settings=_settings(), provider=provider)
    context = {
        "websiteType": "portfolio",
        "userData": {
            "name": "Alex",
            "role": "Designer",
            "socialLinks": {"github": "https://github.com/alex-example"},
        },
        "preferences": {},
    }

    await agent.run(context)

    assert "github.com/alex-example" in provider.calls[0]["prompt"]


async def test_invalid_llm_output_retries_then_succeeds(valid_requirements_payload):
    provider = FakeProvider(responses=["not json at all", json.dumps(valid_requirements_payload)])
    agent = RequirementsAgent(settings=_settings(), provider=provider)
    context = {"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}}

    result = await agent.run(context)

    assert result.websiteType == "portfolio"
    assert len(provider.calls) == 2
    assert "FAILED VALIDATION" in provider.calls[1]["prompt"]


async def test_schema_validation_failure_exhausts_retries_and_stops():
    # Empty object — never valid, no matter how many times we retry.
    provider = FakeProvider(responses=["{}", "{}", "{}"])
    agent = RequirementsAgent(settings=_settings(max_schema_retries=2), provider=provider)
    context = {"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}}

    with pytest.raises(AgentError) as exc_info:
        await agent.run(context)

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"
    assert exc_info.value.stage == "RequirementsAgent"
    # initial attempt + 2 retries = 3 calls, then it must stop — not loop forever.
    assert len(provider.calls) == 3


async def test_provider_failure_does_not_retry():
    provider = FakeProvider(fail_with="rate limited")
    agent = RequirementsAgent(settings=_settings(max_schema_retries=2), provider=provider)
    context = {"websiteType": "portfolio", "userData": {"name": "Alex", "role": "Designer"}, "preferences": {}}

    with pytest.raises(AgentError) as exc_info:
        await agent.run(context)

    assert exc_info.value.code == "PROVIDER_FAILURE"
    assert len(provider.calls) == 1  # a provider failure is not schema-retried
