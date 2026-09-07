"""Project repository tests — Phase 5, Section 29 'Project Repository'."""
import pytest

from storage.base import ProjectNotFoundError
from storage.models import Project, ProjectStatus, StoredFile


def _project(**overrides) -> Project:
    defaults = {
        "jobId": "job-1",
        "name": "portfolio-site",
        "websiteType": "portfolio",
        "framework": "react-vite",
        "language": "javascript",
        "styling": "css",
        "files": [StoredFile(path="package.json", type="configuration", purpose="x", content="{}")],
        "entryPoints": ["src/main.jsx"],
        "directories": ["src"],
    }
    return Project(**{**defaults, **overrides})


async def test_create_and_get(repository):
    created = await repository.create_project(_project())

    fetched = await repository.get_project(created.projectId)

    assert fetched.projectId == created.projectId
    assert fetched.status == ProjectStatus.GENERATING


async def test_get_not_found_raises(repository):
    with pytest.raises(ProjectNotFoundError):
        await repository.get_project("does-not-exist")


async def test_update_not_found_raises(repository):
    with pytest.raises(ProjectNotFoundError):
        await repository.update_project("does-not-exist", status=ProjectStatus.READY)


async def test_update_status_to_ready(repository):
    project = await repository.create_project(_project())

    updated = await repository.update_project(project.projectId, status=ProjectStatus.READY)

    assert updated.status == ProjectStatus.READY


async def test_metadata_fields_preserved(repository):
    created = await repository.create_project(_project(name="my-portfolio"))

    fetched = await repository.get_project(created.projectId)

    assert fetched.name == "my-portfolio"
    assert fetched.websiteType == "portfolio"
    assert fetched.framework == "react-vite"


async def test_full_manifest_round_trips(repository):
    project = _project(
        files=[
            StoredFile(path="package.json", type="configuration", purpose="deps", content='{"name":"x"}'),
            StoredFile(path="src/App.jsx", type="application", purpose="app", content="export default function App(){}"),
        ],
        entryPoints=["src/main.jsx", "src/App.jsx"],
        directories=["src", "src/components"],
    )
    created = await repository.create_project(project)

    fetched = await repository.get_project(created.projectId)

    assert len(fetched.files) == 2
    assert fetched.files[1].content == "export default function App(){}"
    assert fetched.entryPoints == ["src/main.jsx", "src/App.jsx"]
    assert fetched.directories == ["src", "src/components"]
