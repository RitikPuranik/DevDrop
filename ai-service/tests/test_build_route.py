"""Tests for POST /v1/build/portfolio — Phase 4, Section 17."""
import json

from fastapi.testclient import TestClient

from config import get_settings
from schemas.build import BuildResult
from tests.fakes import FakeProvider


def _client_with_fake_pipeline(
    monkeypatch,
    valid_requirements_payload,
    valid_design_payload,
    valid_full_architecture_payload,
    valid_code_generation_payload,
):
    fake_provider = FakeProvider(
        responses=[
            json.dumps(valid_requirements_payload),
            json.dumps(valid_design_payload),
            json.dumps(valid_full_architecture_payload),
            json.dumps(valid_code_generation_payload),
        ]
    )
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake_provider)

    class _FakeSandboxForRoute:
        async def build(self, project):
            return BuildResult(status="success", exitCode=0, stdout="built ok", durationMs=100)

    monkeypatch.setattr("orchestrator.generation_pipeline.get_sandbox", lambda settings=None: _FakeSandboxForRoute())
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()

    from main import app

    return TestClient(app)


def test_build_portfolio_success(
    monkeypatch,
    portfolio_input,
    valid_requirements_payload,
    valid_design_payload,
    valid_full_architecture_payload,
    valid_code_generation_payload,
):
    client = _client_with_fake_pipeline(
        monkeypatch,
        valid_requirements_payload,
        valid_design_payload,
        valid_full_architecture_payload,
        valid_code_generation_payload,
    )

    resp = client.post("/v1/build/portfolio", json=portfolio_input)

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["status"] == "completed"
    assert body["buildResult"]["status"] == "success"
    assert body["repairAttempts"] == 0
    assert len(body["files"]) == 13
    assert "jobId" in body


def test_build_portfolio_rejects_malformed_body(monkeypatch):
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/build/portfolio", json={"websiteType": "portfolio"})  # missing required userData

    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"


def test_build_portfolio_provider_failure_returns_structured_error(monkeypatch, portfolio_input):
    fake_provider = FakeProvider(fail_with="rate limited")
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake_provider)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/build/portfolio", json=portfolio_input)

    assert resp.status_code == 502
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "PROVIDER_FAILURE"


def test_generation_and_planning_endpoints_still_work_unaffected(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    """Regression guard at the HTTP layer: adding /v1/build/* must not
    change /v1/planning/* or /v1/generation/*'s behavior at all."""
    fake_provider = FakeProvider(
        responses=[
            json.dumps(valid_requirements_payload),
            json.dumps(valid_design_payload),
            json.dumps(valid_architecture_payload),
        ]
    )
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake_provider)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/planning/portfolio", json=portfolio_input)

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "buildResult" not in body
    assert "files" not in body
