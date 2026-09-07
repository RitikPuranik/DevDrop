"""Architecture Agent tests — Phase 2, Section 13."""
import json

import pytest

from agents.architecture_agent import ArchitectureAgent
from agents.base_agent import AgentError
from config import Settings
from tests.fakes import FakeProvider, fixed_response_provider


def _settings(max_schema_retries: int = 2) -> Settings:
    return Settings(max_schema_retries=max_schema_retries)


def _context(valid_requirements_payload, valid_design_payload):
    return {"requirements": valid_requirements_payload, "design": valid_design_payload}


async def test_valid_requirements_and_design_produce_an_architecture(
    valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    provider = fixed_response_provider(valid_architecture_payload)
    agent = ArchitectureAgent(settings=_settings(), provider=provider)

    result = await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert result.project.framework == "react-vite"
    assert "$ref" not in json.dumps(provider.calls[0]["response_schema"])


async def test_non_react_vite_framework_is_rejected(
    valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    bad_payload = json.loads(json.dumps(valid_architecture_payload))
    bad_payload["project"]["framework"] = "next-js"  # not on the allowed list
    # It never gets better — the model persistently picks a disallowed framework.
    provider = FakeProvider(responses=[json.dumps(bad_payload)] * 3)
    agent = ArchitectureAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"
    assert len(provider.calls) == 3


async def test_duplicate_file_paths_are_rejected(
    valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    bad_payload = json.loads(json.dumps(valid_architecture_payload))
    bad_payload["files"].append(dict(bad_payload["files"][0]))  # duplicate the first file's path
    provider = FakeProvider(responses=[json.dumps(bad_payload)] * 3)
    agent = ArchitectureAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"
    assert len(provider.calls) == 3


async def test_path_traversal_is_rejected(
    valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    bad_payload = json.loads(json.dumps(valid_architecture_payload))
    bad_payload["files"][0]["path"] = "../../etc/passwd"
    provider = FakeProvider(responses=[json.dumps(bad_payload)] * 3)
    agent = ArchitectureAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"
    assert len(provider.calls) == 3


async def test_absolute_path_is_rejected(
    valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    bad_payload = json.loads(json.dumps(valid_architecture_payload))
    bad_payload["directories"][0] = "/etc"
    provider = FakeProvider(responses=[json.dumps(bad_payload)] * 3)
    agent = ArchitectureAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"


async def test_entry_point_missing_a_matching_file_contract_is_rejected(
    valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    bad_payload = json.loads(json.dumps(valid_architecture_payload))
    bad_payload["entryPoints"].append("src/missing.jsx")  # no matching entry in `files`
    provider = FakeProvider(responses=[json.dumps(bad_payload)] * 3)
    agent = ArchitectureAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert exc_info.value.code == "SCHEMA_VALIDATION_FAILED"


async def test_invalid_json_retries_then_succeeds(
    valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    provider = FakeProvider(responses=["nope, not json", json.dumps(valid_architecture_payload)])
    agent = ArchitectureAgent(settings=_settings(), provider=provider)

    result = await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert result is not None
    assert len(provider.calls) == 2


async def test_provider_failure_does_not_retry(valid_requirements_payload, valid_design_payload):
    provider = FakeProvider(fail_with="connection reset")
    agent = ArchitectureAgent(settings=_settings(max_schema_retries=2), provider=provider)

    with pytest.raises(AgentError) as exc_info:
        await agent.run(_context(valid_requirements_payload, valid_design_payload))

    assert exc_info.value.code == "PROVIDER_FAILURE"
    assert len(provider.calls) == 1
