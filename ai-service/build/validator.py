"""
Build Validator — Phase 4, Section 10.

Bundles pre-build static checks with the actual sandbox build into one
call, matching Section 10's own diagram (ProjectManifest -> pre-build
checks -> sandbox build -> BuildResult) rather than splitting it across
two separately-orchestrated steps. This also means the repair loop in
orchestrator/generation_pipeline.py doesn't need its own separate
re-validation step after each patch — every rebuild attempt already goes
through validate_and_build(), so a patch that breaks static validity
(e.g. corrupts package.json's JSON) is caught here on the very next
attempt, the same way it would be on the first one.

Pre-build checks reuse project.validator.validate_project() rather than
re-implementing required-files/package.json/architecture-contract
checks — Section 10 lists "project manifest validity" among its pre-build
checks, which is exactly what that function already does.
"""
from config import Settings, get_settings
from project.manifest import ProjectManifest
from project.validator import validate_project
from sandbox.base import BuildSandbox
from sandbox.factory import get_sandbox
from schemas.build import BuildResult


class PreBuildValidationError(Exception):
    """Raised when the manifest fails static validation before a build is
    even attempted — either the original generation, or (more often in
    practice) a Debug Agent patch that broke something the schema alone
    doesn't check (e.g. package.json losing its 'build' script)."""

    def __init__(self, errors: list[str]):
        super().__init__("; ".join(errors))
        self.errors = errors


async def validate_and_build(
    manifest: ProjectManifest,
    architecture: dict,
    settings: Settings | None = None,
    sandbox: BuildSandbox | None = None,
) -> BuildResult:
    settings = settings or get_settings()
    sandbox = sandbox or get_sandbox(settings)

    pre_build = validate_project(manifest, architecture)
    if not pre_build.valid:
        raise PreBuildValidationError(pre_build.errors)

    return await sandbox.build(manifest)
