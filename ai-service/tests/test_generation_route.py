"""Tests for POST /v1/generation/portfolio — Phase 3, Section 13."""
import json

from fastapi.testclient import TestClient

from config import get_settings
from tests.fakes import FakeProvider


def _client_with_fake_pipeline(
    monkeypatch,
    valid_requirements_payload,
    valid_design_payload,
    valid_full_architecture_payload,
    valid_code_generation_payload,
):
    fake = FakeProvider(
        responses=[
            json.dumps(valid_requirements_payload),
            json.dumps(valid_design_payload),
            json.dumps(valid_full_architecture_payload),
            json.dumps(valid_code_generation_payload),
        ]
    )
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()

    from main import app

    return TestClient(app)


def test_generate_portfolio_success(
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

    resp = client.post("/v1/generation/portfolio", json=portfolio_input)

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["status"] == "completed"
    assert body["stage"] == "COMPLETED"
    assert body["project"]["framework"] == "react-vite"
    assert len(body["files"]) == 13
    assert body["validation"] == {"valid": True, "errors": [], "warnings": []}
    assert "jobId" in body


def test_generate_portfolio_rejects_malformed_body(monkeypatch):
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/generation/portfolio", json={"websiteType": "portfolio"})  # missing required userData

    assert resp.status_code == 422
    body = resp.json()
    assert body["success"] is False
    assert body["code"] == "VALIDATION_ERROR"


def test_generate_portfolio_provider_failure_returns_structured_error(monkeypatch, portfolio_input):
    fake = FakeProvider(fail_with="rate limited")
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/generation/portfolio", json=portfolio_input)

    assert resp.status_code == 502
    body = resp.json()
    assert body["success"] is False
    assert body["error"]["code"] == "PROVIDER_FAILURE"
    assert body["error"]["stage"] == "REQUIREMENTS"


def test_planning_endpoint_still_works_unaffected(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    """Regression guard at the HTTP layer, not just the pipeline layer:
    the Phase 2 endpoint's shape and behavior must be completely
    unaffected by Phase 3's new endpoint existing alongside it."""
    fake = FakeProvider(
        responses=[
            json.dumps(valid_requirements_payload),
            json.dumps(valid_design_payload),
            json.dumps(valid_architecture_payload),
        ]
    )
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/planning/portfolio", json=portfolio_input)

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert "files" not in body  # planning never returns generated files
    assert set(body["planning"].keys()) == {"requirements", "design", "architecture"}
