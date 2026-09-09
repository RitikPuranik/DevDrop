"""
Section 20's admin API, exercised over real HTTP via TestClient — same
pattern tests/test_jobs_route.py and tests/test_projects_route.py use:
monkeypatch the route module's storage accessor, clear SERVICE_AUTH_TOKEN
so the (open-by-default, Section 27) internal auth doesn't need a real
secret in tests, then hit the app through TestClient.
"""
import pytest
from fastapi.testclient import TestClient

from config import get_settings
from storage.gemini_pool_memory import InMemoryGeminiPoolRepository
from storage.gemini_pool_models import GeminiProjectCredential, GeminiProjectStatus


def _project(**overrides) -> GeminiProjectCredential:
    defaults = dict(name="p", projectId="proj", credentialReference="super-secret-key-value", model="gemini-2.0-flash")
    return GeminiProjectCredential(**{**defaults, **overrides})


@pytest.fixture
def repository():
    return InMemoryGeminiPoolRepository()


@pytest.fixture
def client(monkeypatch, repository):
    monkeypatch.setattr("routes.gemini_pool_admin.get_gemini_pool_repository", lambda settings=None: repository)
    monkeypatch.delenv("SERVICE_AUTH_TOKEN", raising=False)
    get_settings.cache_clear()

    from main import app

    return TestClient(app)


def test_list_empty_pool(client):
    resp = client.get("/v1/admin/gemini-projects")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["items"] == []
    assert body["total"] == 0


def test_create_project_returns_masked_credential_never_the_raw_key(client):
    resp = client.post(
        "/v1/admin/gemini-projects",
        json={"name": "A", "projectId": "proj-a", "apiKey": "AIzaSyD-1234567890EXAMPLEKEY", "model": "gemini-2.0-flash"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["success"] is True
    project = body["project"]
    assert project["status"] == "active"
    assert "credentialReference" not in project
    assert "apiKey" not in project
    assert "1234567890" not in resp.text  # the raw key must never appear anywhere in the response body
    assert project["maskedCredential"].startswith("AIza")


async def test_created_project_is_immediately_visible_to_list(client, repository):
    client.post(
        "/v1/admin/gemini-projects",
        json={"name": "A", "projectId": "proj-a", "apiKey": "key-a", "model": "gemini-2.0-flash"},
    )
    resp = client.get("/v1/admin/gemini-projects")
    assert resp.json()["total"] == 1


async def test_get_single_project(client, repository):
    p = await repository.create_project(_project())
    resp = client.get(f"/v1/admin/gemini-projects/{p.id}")
    assert resp.status_code == 200
    assert resp.json()["project"]["id"] == p.id


def test_get_missing_project_is_404(client):
    resp = client.get("/v1/admin/gemini-projects/does-not-exist")
    assert resp.status_code == 404


async def test_patch_updates_editable_fields(client, repository):
    p = await repository.create_project(_project(rpmLimit=10))
    resp = client.patch(f"/v1/admin/gemini-projects/{p.id}", json={"name": "Renamed", "rpmLimit": 50})
    assert resp.status_code == 200
    project = resp.json()["project"]
    assert project["name"] == "Renamed"
    assert project["rpmLimit"] == 50


async def test_patch_status_disabled_then_active_round_trips(client, repository):
    p = await repository.create_project(_project())
    disabled = client.patch(f"/v1/admin/gemini-projects/{p.id}", json={"status": "disabled"})
    assert disabled.json()["project"]["status"] == "disabled"

    enabled = client.patch(f"/v1/admin/gemini-projects/{p.id}", json={"status": "active"})
    assert enabled.json()["project"]["status"] == "active"


async def test_patch_rejects_a_scheduler_owned_status_value(client, repository):
    p = await repository.create_project(_project())
    resp = client.patch(f"/v1/admin/gemini-projects/{p.id}", json={"status": "cooldown_rpm"})
    assert resp.status_code == 400


async def test_patch_on_auth_error_project_to_active_returns_409(client, repository):
    p = await repository.create_project(_project(status=GeminiProjectStatus.AUTH_ERROR))
    resp = client.patch(f"/v1/admin/gemini-projects/{p.id}", json={"status": "active"})
    assert resp.status_code == 409


async def test_delete_default_is_soft_remove_project_still_queryable(client, repository):
    p = await repository.create_project(_project())
    resp = client.delete(f"/v1/admin/gemini-projects/{p.id}")
    assert resp.status_code == 200
    assert resp.json()["project"]["status"] == "removed"

    # Still fetchable directly — Section 4's "metadata isn't deleted."
    still_there = await repository.get_project(p.id)
    assert still_there.status == GeminiProjectStatus.REMOVED


async def test_delete_with_purge_removes_it_permanently(client, repository):
    p = await repository.create_project(_project())
    resp = client.delete(f"/v1/admin/gemini-projects/{p.id}?purge=true")
    assert resp.status_code == 200

    from storage.gemini_pool_base import GeminiProjectNotFoundError

    with pytest.raises(GeminiProjectNotFoundError):
        await repository.get_project(p.id)


def test_delete_missing_project_is_404(client):
    resp = client.delete("/v1/admin/gemini-projects/does-not-exist")
    assert resp.status_code == 404


async def test_test_endpoint_reports_failure_without_real_network(client, repository, monkeypatch):
    """The admin /test route uses the real `call_gemini_api` by default,
    which would try real network — for this HTTP-level test we only need
    to confirm the route wires errors through correctly, so we point the
    lifecycle module's default caller at a fake that always fails
    predictably instead of hitting Gemini."""
    from gemini_pool.gemini_client import GeminiEmptyResponseError

    async def _always_empty(**kwargs):
        raise GeminiEmptyResponseError("empty")

    monkeypatch.setattr("gemini_pool.gemini_client.call_gemini_api", _always_empty)

    p = await repository.create_project(_project())
    resp = client.post(f"/v1/admin/gemini-projects/{p.id}/test")
    assert resp.status_code == 200
    body = resp.json()["result"]
    assert body["success"] is False
    assert body["status"] == "active"  # application-error-shaped failure doesn't penalize the project


def test_test_endpoint_missing_project_is_404(client):
    resp = client.post("/v1/admin/gemini-projects/does-not-exist/test")
    assert resp.status_code == 404


async def test_pool_health_summary_reflects_current_counts(client, repository):
    await repository.create_project(_project(projectId="a"))
    await repository.create_project(_project(projectId="b", credentialReference="key-b", status=GeminiProjectStatus.DISABLED))

    resp = client.get("/v1/admin/gemini-projects/health/summary")
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["totalProjects"] == 2
    assert body["activeProjects"] == 1
    assert body["disabledProjects"] == 1


def test_pool_health_summary_route_is_not_shadowed_by_the_id_route(client):
    """`/health/summary` must resolve to the aggregate endpoint, not be
    interpreted as `/{project_id}` with project_id='health' followed by a
    404 on a nonexistent sub-route."""
    resp = client.get("/v1/admin/gemini-projects/health/summary")
    assert resp.status_code == 200
    assert "totalProjects" in resp.json()
