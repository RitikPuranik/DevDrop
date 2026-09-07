"""Tests for GET /v1/projects/{projectId} and GET /v1/projects."""
from fastapi.testclient import TestClient

from config import get_settings
from storage.memory import InMemoryRepository
from storage.models import Project, ProjectStatus, StoredFile


def _client(monkeypatch, repository):
    monkeypatch.setattr("routes.projects.get_repository", lambda: repository)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()
    from main import app

    return TestClient(app)


def _project(**overrides) -> Project:
    defaults = {
        "jobId": "job-1",
        "name": "portfolio-site",
        "websiteType": "portfolio",
        "framework": "react-vite",
        "language": "javascript",
        "styling": "css",
        "status": ProjectStatus.READY,
        "files": [StoredFile(path="package.json", type="configuration", purpose="x", content="{}")],
    }
    return Project(**{**defaults, **overrides})


async def _seed(repository, **overrides) -> Project:
    return await repository.create_project(_project(**overrides))


def test_get_project_success(monkeypatch):
    repository = InMemoryRepository()
    import asyncio

    project = asyncio.run(_seed(repository))
    client = _client(monkeypatch, repository)

    resp = client.get(f"/v1/projects/{project.projectId}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["projectId"] == project.projectId
    assert body["status"] == "ready"
    assert len(body["files"]) == 1


def test_get_project_not_found(monkeypatch):
    repository = InMemoryRepository()
    client = _client(monkeypatch, repository)

    resp = client.get("/v1/projects/does-not-exist")

    assert resp.status_code == 404


def test_list_projects_default(monkeypatch):
    repository = InMemoryRepository()
    import asyncio

    asyncio.run(_seed(repository, name="site-a"))
    asyncio.run(_seed(repository, name="site-b"))
    client = _client(monkeypatch, repository)

    resp = client.get("/v1/projects")

    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    assert "files" not in body["items"][0]  # metadata only


def test_list_projects_rejects_negative_page(monkeypatch):
    repository = InMemoryRepository()
    client = _client(monkeypatch, repository)

    resp = client.get("/v1/projects?page=-1")

    assert resp.status_code == 422
    assert resp.json()["code"] == "VALIDATION_ERROR"


def test_list_projects_rejects_zero_limit(monkeypatch):
    repository = InMemoryRepository()
    client = _client(monkeypatch, repository)

    resp = client.get("/v1/projects?limit=0")

    assert resp.status_code == 422


def test_list_projects_clamps_oversized_limit(monkeypatch):
    repository = InMemoryRepository()
    import asyncio

    asyncio.run(_seed(repository))
    client = _client(monkeypatch, repository)

    resp = client.get("/v1/projects?limit=999999")

    assert resp.status_code == 200
    assert resp.json()["limit"] == get_settings().max_page_size


def test_list_projects_empty(monkeypatch):
    repository = InMemoryRepository()
    client = _client(monkeypatch, repository)

    resp = client.get("/v1/projects")

    assert resp.status_code == 200
    body = resp.json()
    assert body["items"] == []
    assert body["total"] == 0
