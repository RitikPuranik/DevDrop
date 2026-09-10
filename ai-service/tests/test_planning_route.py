"""Tests for POST /v1/planning/portfolio — Phase 2, Section 12."""
import json

from fastapi.testclient import TestClient

from config import get_settings
from tests.fakes import FakeProvider


def _client_with_fake_pipeline(monkeypatch, valid_requirements_payload, valid_design_payload, valid_architecture_payload):
    # One shared fake, scripted with all three stages' responses in pipeline
    # order — Requirements calls generate() first, then Design, then
    # Architecture, so each gets the right one without needing three
    # separately-patched providers.
    fake = FakeProvider(
        responses=[
            json.dumps(valid_requirements_payload),
            json.dumps(valid_design_payload),
            json.dumps(valid_architecture_payload),
        ]
    )
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake)
    get_settings.cache_clear()

    from main import app

    return TestClient(app)


def test_plan_portfolio_success(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    client = _client_with_fake_pipeline(
        monkeypatch, valid_requirements_payload, valid_design_payload, valid_architecture_payload
    )

    resp = client.post("/v1/planning/portfolio", json=portfolio_input)

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["planning"]["requirements"]["websiteType"] == "portfolio"
    assert body["planning"]["design"]["designSystem"]["theme"] == "dark"
    assert body["planning"]["architecture"]["project"]["framework"] == "react-vite"


def test_plan_portfolio_rejects_malformed_body(monkeypatch):
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/planning/portfolio", json={"websiteType": "portfolio"})  # missing required userData

    assert resp.status_code == 422
    body = resp.json()
    assert body["success"] is False
    assert body["code"] == "VALIDATION_ERROR"


def test_plan_portfolio_requires_auth_header_when_token_configured(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_architecture_payload
):
    monkeypatch.setenv("SERVICE_AUTH_TOKEN", "secret-token")
    client = _client_with_fake_pipeline(
        monkeypatch, valid_requirements_payload, valid_design_payload, valid_architecture_payload
    )

    unauthorized = client.post("/v1/planning/portfolio", json=portfolio_input)
    assert unauthorized.status_code == 401
    assert unauthorized.json()["success"] is False

    authorized = client.post(
        "/v1/planning/portfolio", json=portfolio_input, headers={"X-Service-Auth": "secret-token"}
    )
    assert authorized.status_code == 200
