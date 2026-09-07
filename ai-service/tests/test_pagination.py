"""Pagination tests — Phase 5, Section 29 'Pagination'."""
from storage.models import Project


def _project(name: str) -> Project:
    return Project(
        jobId="job-1", name=name, websiteType="portfolio", framework="react-vite", language="javascript", styling="css"
    )


async def test_default_page_returns_all_when_under_limit(repository):
    for i in range(3):
        await repository.create_project(_project(f"site-{i}"))

    page = await repository.list_projects(page=1, limit=20)

    assert len(page.items) == 3
    assert page.total == 3


async def test_custom_page_size(repository):
    for i in range(5):
        await repository.create_project(_project(f"site-{i}"))

    page = await repository.list_projects(page=1, limit=2)

    assert len(page.items) == 2
    assert page.total == 5


async def test_second_page(repository):
    for i in range(5):
        await repository.create_project(_project(f"site-{i}"))

    page1 = await repository.list_projects(page=1, limit=2)
    page2 = await repository.list_projects(page=2, limit=2)

    ids_page1 = {item.projectId for item in page1.items}
    ids_page2 = {item.projectId for item in page2.items}
    assert ids_page1.isdisjoint(ids_page2)  # no overlap between pages


async def test_empty_result_beyond_last_page(repository):
    await repository.create_project(_project("only-one"))

    page = await repository.list_projects(page=5, limit=20)

    assert page.items == []
    assert page.total == 1  # total still reflects the real count, not the empty page


async def test_empty_repository_returns_empty_page(repository):
    page = await repository.list_projects(page=1, limit=20)

    assert page.items == []
    assert page.total == 0


async def test_owner_filter_scopes_results(repository):
    await repository.create_project(_project("alice-site").model_copy(update={"ownerId": "alice"}))
    await repository.create_project(_project("bob-site").model_copy(update={"ownerId": "bob"}))

    page = await repository.list_projects(page=1, limit=20, owner_id="alice")

    assert page.total == 1
    assert page.items[0].name == "alice-site"


async def test_list_never_includes_file_contents(repository):
    """Section 34: list endpoint must be metadata-only."""
    await repository.create_project(_project("has-files"))

    page = await repository.list_projects(page=1, limit=20)

    assert not hasattr(page.items[0], "files")
