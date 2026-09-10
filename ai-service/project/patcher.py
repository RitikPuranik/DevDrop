"""
Deterministic patcher — Phase 4, Sections 15–16, 21.

The LLM (Debug Agent) proposes changes; this module is the only thing
that actually applies them to a ProjectManifest. Every safety property
Section 16 asks for is enforced here, on top of what the schema already
guarantees:

- Path safety: re-checked defensively (schemas.debug.FileChange's own
  field_validator already enforces this, but a filesystem-adjacent
  operation like this is exactly the kind of place that shouldn't trust
  a single upstream check).
- Framework/language/styling unchanged: not re-validated because it's
  structurally impossible to violate — DebugResult has no `project`
  field at all, and this function always carries `manifest.project`
  over untouched.
- Only existing files can be patched — Phase 4 doesn't support the Debug
  Agent introducing new files (Section 21: patch, don't regenerate).
- Forbidden filenames (.env and friends) can never be patched, even if
  one somehow existed in the manifest already.
- A patched package.json is re-checked for unsafe scripts before being
  accepted — Section 16's "no unsafe scripts are introduced" explicitly
  needs this, since a patch to package.json is otherwise indistinguishable
  from a patch to any other file.
"""
import json
import re

from pydantic import ValidationError

from build.command_validator import UnsafeScriptError, validate_package_scripts
from project.manifest import ProjectManifest
from schemas.code_generation import GeneratedFile
from schemas.debug import DebugResult
from schemas.utils import validate_relative_path

# Basename-only, not a substring match anywhere in the path — a substring
# check would false-positive on a legitimate component like
# "TokenGate.jsx" or "secretSanta.js"; these patterns target actual
# credential-file naming conventions specifically.
_FORBIDDEN_BASENAME_PATTERNS = [
    re.compile(r"^\.env(\..+)?$", re.IGNORECASE),
    re.compile(r"^credentials\.(json|ya?ml|env)$", re.IGNORECASE),
    re.compile(r"^secrets\.(json|ya?ml|env)$", re.IGNORECASE),
]


class PatchError(Exception):
    """Raised for any invalid or unsafe patch. The pipeline treats this as
    a hard failure, not a repair attempt — a patch we can't even apply is
    a different kind of problem than a rebuild that still fails."""


def apply_patch(manifest: ProjectManifest, debug_result: DebugResult) -> ProjectManifest:
    files_by_path = {f.path: f for f in manifest.files}

    for change in debug_result.changes:
        try:
            safe_path = validate_relative_path(change.path)
        except ValueError as exc:
            raise PatchError(str(exc)) from exc

        if _looks_forbidden(safe_path):
            raise PatchError(f"Refusing to patch '{safe_path}' — matches a forbidden file pattern.")

        if safe_path not in files_by_path:
            raise PatchError(
                f"Debug Agent proposed a change to '{safe_path}', which isn't part of the "
                "current project. Only replacing existing files is supported in this phase."
            )

        old_file = files_by_path[safe_path]
        try:
            files_by_path[safe_path] = GeneratedFile(
                path=safe_path, type=old_file.type, purpose=old_file.purpose, content=change.content
            )
        except ValidationError as exc:
            raise PatchError(f"Proposed content for '{safe_path}' failed validation: {exc}") from exc

    _reject_if_package_json_now_unsafe(files_by_path)

    return ProjectManifest(
        project=manifest.project,  # framework/language/styling always carried over, never re-derived
        files=[files_by_path[f.path] for f in manifest.files],  # preserve original file order
        entryPoints=manifest.entryPoints,
        directories=manifest.directories,
    )


def _reject_if_package_json_now_unsafe(files_by_path: dict[str, GeneratedFile]) -> None:
    package_json = files_by_path.get("package.json")
    if package_json is None:
        return
    try:
        parsed = json.loads(package_json.content)
    except json.JSONDecodeError:
        return  # not this module's job -- build/validator.py's re-validation catches malformed JSON
    if not isinstance(parsed, dict):
        return
    try:
        validate_package_scripts(parsed)
    except UnsafeScriptError as exc:
        raise PatchError(f"Patched package.json introduces an unsafe script: {exc}") from exc


def _looks_forbidden(path: str) -> bool:
    basename = path.rsplit("/", 1)[-1]
    return any(pattern.match(basename) for pattern in _FORBIDDEN_BASENAME_PATTERNS)
