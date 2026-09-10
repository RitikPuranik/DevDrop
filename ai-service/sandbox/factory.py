"""
Sandbox factory — Phase 4, Section 25.

Only "local" exists today. This factory function is the seam a future
Docker/Firecracker/isolated-worker implementation plugs into without the
orchestrator or build/validator.py changing at all — same shape as
providers.factory.get_provider().
"""
from config import Settings, get_settings
from sandbox.base import BuildSandbox
from sandbox.local import LocalSandbox

_SANDBOXES: dict[str, type[BuildSandbox]] = {
    "local": LocalSandbox,
}


def get_sandbox(settings: Settings | None = None) -> BuildSandbox:
    settings = settings or get_settings()
    # Only one implementation exists in Phase 4 — no BUILD_SANDBOX env var
    # yet, since there's nothing to select between. Wiring one in later is
    # exactly the one-class-plus-one-dict-entry change providers.factory
    # already demonstrates the pattern for.
    return _SANDBOXES["local"](settings)
