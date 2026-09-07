"""
LocalSandbox tests — Phase 4, Sections 26, 31.

Two tiers, deliberately:
- Fast, no-network tests exercise `_materialize`/`_run` directly with
  trivial commands (echo, a short sleep) — Section 26's "use a fake
  executable ... where necessary" for the mechanical properties
  (isolation, capture, exit code, timeout, cleanup).
- `test_real_build_of_valid_project_succeeds` is Section 31's explicit
  requirement: at least one integration test that executes a real,
  harmless fixture through the actual sandbox — genuine `npm install` +
  `vite build`, not a mocked subprocess call. It's the slow one (~15s);
  everything else in this file runs in well under a second.
"""
import asyncio
import sys
import time
from pathlib import Path

import pytest

from config import Settings
from project.generator import build_manifest
from project.manifest import ProjectManifest
from sandbox.local import LocalSandbox
from schemas.code_generation import GeneratedProject


def _tiny_manifest() -> ProjectManifest:
    return ProjectManifest(
        project={"name": "x", "framework": "react-vite", "language": "javascript", "styling": "css"},
        files=[
            {"path": "package.json", "type": "configuration", "purpose": "x", "content": '{"name": "x"}'},
            {"path": "src/nested/deep/file.txt", "type": "asset-reference", "purpose": "x", "content": "hello"},
        ],
        entryPoints=[],
        directories=[],
    )


def test_materialize_writes_files_with_correct_content(tmp_path):
    sandbox = LocalSandbox(settings=Settings())
    manifest = _tiny_manifest()

    sandbox._materialize(manifest, tmp_path)

    assert (tmp_path / "package.json").read_text() == '{"name": "x"}'


def test_materialize_creates_nested_directories(tmp_path):
    sandbox = LocalSandbox(settings=Settings())
    manifest = _tiny_manifest()

    sandbox._materialize(manifest, tmp_path)

    nested = tmp_path / "src" / "nested" / "deep" / "file.txt"
    assert nested.exists()
    assert nested.read_text() == "hello"


async def test_run_captures_stdout_and_exit_code(tmp_path):
    sandbox = LocalSandbox(settings=Settings())
    result = await sandbox._run([sys.executable, "-c", "print('hello from the sandbox')"], tmp_path, timeout=10)
    assert result.returncode == 0
    assert "hello from the sandbox" in result.stdout


async def test_run_captures_stderr(tmp_path):
    sandbox = LocalSandbox(settings=Settings())
    result = await sandbox._run(
        [sys.executable, "-c", "import sys; sys.stderr.write('oops'); sys.exit(1)"], tmp_path, timeout=10
    )
    assert result.returncode == 1
    assert "oops" in result.stderr


async def test_run_enforces_timeout_and_kills_the_process(tmp_path):
    sandbox = LocalSandbox(settings=Settings())
    start = time.monotonic()
    with pytest.raises(Exception):  # _BuildTimeoutError, deliberately caught broadly here
        await sandbox._run([sys.executable, "-c", "import time; time.sleep(30)"], tmp_path, timeout=0.5)
    elapsed = time.monotonic() - start
    assert elapsed < 5  # proves it was actually killed, not left to run its full 30s


async def test_temp_directory_is_cleaned_up_after_build():
    sandbox = LocalSandbox(settings=Settings(build_timeout_seconds=5))
    manifest = ProjectManifest(
        project={"name": "x", "framework": "react-vite", "language": "javascript", "styling": "css"},
        files=[{"path": "package.json", "type": "configuration", "purpose": "x", "content": "{not valid json"}],
        entryPoints=[],
        directories=[],
    )
    leaked_paths: list[Path] = []
    original_materialize = sandbox._materialize

    def spying_materialize(project, root):
        leaked_paths.append(root)
        return original_materialize(project, root)

    sandbox._materialize = spying_materialize
    result = await sandbox.build(manifest)

    assert result.status == "blocked"  # invalid package.json short-circuits before any subprocess runs
    assert leaked_paths, "materialize was never called — test didn't exercise what it meant to"
    assert not leaked_paths[0].exists()  # the TemporaryDirectory context manager cleaned up


async def test_unsafe_script_is_blocked_without_executing_anything(unsafe_script_codegen_payload, valid_full_architecture_payload):
    generated = GeneratedProject.model_validate(unsafe_script_codegen_payload)
    manifest = build_manifest(generated, valid_full_architecture_payload)
    sandbox = LocalSandbox(settings=Settings(build_timeout_seconds=5))

    result = await sandbox.build(manifest)

    assert result.status == "blocked"
    assert result.exitCode is None  # never ran — nothing to report an exit code for


@pytest.mark.slow
async def test_real_build_of_valid_project_succeeds(valid_code_generation_payload, valid_full_architecture_payload):
    """Section 31's required real integration test: genuine `npm install`
    + `vite build` against the same fixture used throughout this phase's
    development. No mocked subprocess — this is the actual sandbox."""
    generated = GeneratedProject.model_validate(valid_code_generation_payload)
    manifest = build_manifest(generated, valid_full_architecture_payload)
    sandbox = LocalSandbox(settings=Settings(build_timeout_seconds=120))

    result = await sandbox.build(manifest)

    assert result.status == "success"
    assert result.exitCode == 0
    assert "built in" in result.stdout
    assert result.errors == []
