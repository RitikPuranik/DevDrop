"""Tests for POST /v1/generation/jobs and GET /v1/generation/jobs/{jobId}."""
import json

from fastapi.testclient import TestClient

from config import get_settings
from storage.memory import InMemoryRepository
from tests.fakes import FakeProvider


def _client(monkeypatch, repository, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload):
    fake_provider = FakeProvider(
        responses=[
            json.dumps(valid_requirements_payload),
            json.dumps(valid_design_payload),
            json.dumps(valid_full_architecture_payload),
            json.dumps(valid_code_generation_payload),
        ]
    )
    monkeypatch.setattr("agents.base_agent.get_provider", lambda settings=None: fake_provider)

    class _FakeSandbox:
        async def build(self, project):
            from schemas.build import BuildResult

            return BuildResult(status="success", exitCode=0, stdout="ok", durationMs=100)

    monkeypatch.setattr("orchestrator.generation_pipeline.get_sandbox", lambda settings=None: _FakeSandbox())
    monkeypatch.setattr("routes.jobs.get_repository", lambda: repository)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()

    from main import app

    return TestClient(app)


def test_create_job_success(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    repository = InMemoryRepository()
    client = _client(monkeypatch, repository, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload)

    resp = client.post("/v1/generation/jobs", json=portfolio_input)

    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    assert body["status"] == "completed"
    assert body["projectId"] is not None
    assert body["repairAttempts"] == 0


def test_get_job_success(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    repository = InMemoryRepository()
    client = _client(monkeypatch, repository, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload)
    created = client.post("/v1/generation/jobs", json=portfolio_input).json()

    resp = client.get(f"/v1/generation/jobs/{created['jobId']}")

    assert resp.status_code == 200
    assert resp.json()["jobId"] == created["jobId"]


def test_get_job_not_found(monkeypatch):
    repository = InMemoryRepository()
    monkeypatch.setattr("routes.jobs.get_repository", lambda: repository)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.get("/v1/generation/jobs/does-not-exist")

    assert resp.status_code == 404


def test_idempotency_key_header_prevents_rerun(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
):
    repository = InMemoryRepository()
    client = _client(monkeypatch, repository, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload)

    resp1 = client.post("/v1/generation/jobs", json=portfolio_input, headers={"Idempotency-Key": "route-test-key"})
    resp2 = client.post("/v1/generation/jobs", json=portfolio_input, headers={"Idempotency-Key": "route-test-key"})

    assert resp1.json()["jobId"] == resp2.json()["jobId"]


def test_create_job_rejects_malformed_body(monkeypatch):
    repository = InMemoryRepository()
    monkeypatch.setattr("routes.jobs.get_repository", lambda: repository)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    client = TestClient(app)

    resp = client.post("/v1/generation/jobs", json={"websiteType": "portfolio"})  # missing required userData

    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"
