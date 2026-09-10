"""
BuildSandbox interface — Phase 4, Section 2.

The orchestrator only ever calls `sandbox.build(project)` — it has no
idea whether that's a local subprocess (sandbox/local.py, today) or a
container/VM (a future implementation, Section 25). Nothing about
build/validator.py or the pipeline should import a concrete sandbox class
directly; go through sandbox.factory.get_sandbox() instead.
"""
from abc import ABC, abstractmethod

from project.manifest import ProjectManifest
from schemas.build import BuildResult


class BuildSandbox(ABC):
    @abstractmethod
    async def build(self, project: ProjectManifest) -> BuildResult:
        """Materialize `project` somewhere isolated, install dependencies,
        and run its build script. Must never raise for an ordinary build
        outcome — success, failure, timeout, and blocked (unsafe script
        detected, never executed) are all normal `BuildResult`s, not
        exceptions. Only raises for genuine infrastructure problems (e.g.
        the sandbox itself couldn't be created)."""
