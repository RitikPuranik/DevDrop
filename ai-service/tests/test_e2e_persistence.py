"""
Full end-to-end persistence test — Phase 5, Section 30.

POST /v1/generation/jobs -> fake provider drives the entire real pipeline
(Requirements -> Design -> Architecture -> Code Generation -> Static
Validation -> a fake-but-real-shaped Build) -> the result is persisted ->
GET the job, GET the project, GET the project list — proving the
persisted result is genuinely retrievable after the pipeline finishes,
not just returned once in the original response.
"""
import json

from fastapi.testclient import TestClient

from config import get_settings
from storage.memory import InMemoryRepository
from tests.fakes import FakeProvider


def test_full_generation_to_retrieval_flow(
    monkeypatch, portfolio_input, valid_requirements_payload, valid_design_payload, valid_full_architecture_payload, valid_code_generation_payload
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

    class _FakeSandbox:
        async def build(self, project):
            from schemas.build import BuildResult

            return BuildResult(status="success", exitCode=0, stdout="built ok", durationMs=1234)

    monkeypatch.setattr("orchestrator.generation_pipeline.get_sandbox", lambda settings=None: _FakeSandbox())

    repository = InMemoryRepository()
    monkeypatch.setattr("routes.jobs.get_repository", lambda: repository)
    monkeypatch.setattr("routes.projects.get_repository", lambda: repository)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()

    from main import app

    client = TestClient(app)

    # 1. Create the job — this runs the entire pipeline synchronously.
    create_resp = client.post("/v1/generation/jobs", json=portfolio_input, headers={"X-Owner-Id": "user-e2e"})
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created["status"] == "completed"
    job_id = created["jobId"]
    project_id = created["projectId"]
    assert project_id is not None

    # 2. GET the job — a separate request, proving the record survived
    # past the original response.
    job_resp = client.get(f"/v1/generation/jobs/{job_id}")
    assert job_resp.status_code == 200
    job_body = job_resp.json()
    assert job_body["status"] == "completed"
    assert job_body["projectId"] == project_id
    assert job_body["repairAttempts"] == 0

    # 3. GET the project — full manifest, retrievable independently.
    project_resp = client.get(f"/v1/projects/{project_id}")
    assert project_resp.status_code == 200
    project_body = project_resp.json()
    assert project_body["status"] == "ready"
    assert project_body["project"]["framework"] == "react-vite"
    assert len(project_body["files"]) == 13
    assert any(f["path"] == "src/App.jsx" for f in project_body["files"])

    # 4. GET the project list — the same project shows up as metadata only.
    list_resp = client.get("/v1/projects?ownerId=user-e2e")
    assert list_resp.status_code == 200
    list_body = list_resp.json()
    assert list_body["total"] == 1
    assert list_body["items"][0]["projectId"] == project_id
    assert "files" not in list_body["items"][0]
