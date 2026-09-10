"""
Deterministic project validator — Phase 3, Sections 11–12.

Runs after code generation, no LLM involved — everything here is a plain
function over data already in hand. Two kinds of checks:

1. Standalone checks on the generated project itself (required files,
   package.json shape) that need cross-file context a single field
   validator can't see.
2. Cross-checks against the Architecture contract that produced this
   project's plan (Section 4) — does what got generated actually match
   what was planned?

Errors mean the project is not valid (`result.valid` becomes False).
Warnings are advisory — surfaced for visibility, never block anything
(Section 11's import check is a plain regex, not a real module resolver,
so it can miss legitimate patterns; it shouldn't get the power to fail a
generation over a false positive).
"""
import json
import posixpath
import re
from dataclasses import dataclass, field

from project.manifest import ProjectManifest

REQUIRED_FILES = ["package.json", "index.html", "src/main.jsx", "src/App.jsx"]
REQUIRED_PACKAGE_SCRIPTS = ["dev", "build"]

_IMPORT_PATTERN = re.compile(r"""(?:from|import)\s+['"](\.[^'"]*)['"]""")
_RESOLVABLE_EXTENSIONS = ("", ".jsx", ".js", ".css")


@dataclass
class ValidationResult:
    valid: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def add_error(self, message: str) -> None:
        self.errors.append(message)
        self.valid = False

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)


def validate_project(manifest: ProjectManifest, architecture: dict) -> ValidationResult:
    result = ValidationResult()
    file_paths = {f.path for f in manifest.files}

    _validate_project_metadata(manifest, result)
    _validate_required_files(file_paths, result)
    _validate_architecture_contract(file_paths, architecture, result)
    _validate_package_json(manifest, result)
    _validate_imports(manifest, result)

    return result


def _validate_project_metadata(manifest: ProjectManifest, result: ValidationResult) -> None:
    if manifest.project.framework != "react-vite":
        result.add_error(f"framework must be 'react-vite', got '{manifest.project.framework}'.")
    if manifest.project.language != "javascript":
        result.add_error(f"language must be 'javascript', got '{manifest.project.language}'.")
    if manifest.project.styling != "css":
        result.add_error(f"styling must be 'css', got '{manifest.project.styling}'.")


def _validate_required_files(file_paths: set[str], result: ValidationResult) -> None:
    for required in REQUIRED_FILES:
        if required not in file_paths:
            result.add_error(f"Required file missing: {required}")


def _validate_architecture_contract(file_paths: set[str], architecture: dict, result: ValidationResult) -> None:
    for entry_point in architecture.get("entryPoints", []):
        if entry_point not in file_paths:
            result.add_error(f"Architecture entry point missing from generated files: {entry_point}")

    architecture_paths = {f["path"] for f in architecture.get("files", [])}
    for path in architecture_paths - file_paths:
        result.add_error(f"Architecture-required file was not generated: {path}")
    for path in file_paths - architecture_paths:
        # Not necessarily wrong (package.json/index.html aren't always
        # itemized in the architecture's own files list), but worth
        # surfacing rather than silently accepting drift from the plan.
        result.add_warning(f"Generated file not present in the architecture contract: {path}")


def _validate_package_json(manifest: ProjectManifest, result: ValidationResult) -> None:
    package_json = next((f for f in manifest.files if f.path == "package.json"), None)
    if package_json is None:
        return  # already reported by _validate_required_files

    try:
        parsed = json.loads(package_json.content)
    except json.JSONDecodeError as exc:
        result.add_error(f"package.json is not valid JSON: {exc}")
        return

    if "name" not in parsed:
        result.add_error("package.json is missing 'name'.")

    scripts = parsed.get("scripts")
    if not isinstance(scripts, dict):
        result.add_error("package.json is missing a 'scripts' object.")
    else:
        for required_script in REQUIRED_PACKAGE_SCRIPTS:
            if required_script not in scripts:
                result.add_error(f"package.json is missing the '{required_script}' script.")

    dependencies = parsed.get("dependencies")
    if dependencies is not None and not isinstance(dependencies, dict):
        result.add_error("package.json 'dependencies' must be an object.")


def _validate_imports(manifest: ProjectManifest, result: ValidationResult) -> None:
    """Lightweight, deterministic check (Section 11: 'where practical') —
    not a real module resolver. Only ever produces warnings; a regex-based
    check can miss legitimate patterns (dynamic imports, computed paths)
    and shouldn't be trusted to hard-fail a generation."""
    file_paths = {f.path for f in manifest.files}
    for f in manifest.files:
        if not f.path.endswith((".jsx", ".js")):
            continue
        for match in _IMPORT_PATTERN.finditer(f.content):
            import_spec = match.group(1)
            if not _import_resolves(f.path, import_spec, file_paths):
                result.add_warning(f"{f.path} imports '{import_spec}', which doesn't resolve to any generated file.")


def _import_resolves(from_path: str, import_spec: str, file_paths: set[str]) -> bool:
    base_dir = posixpath.dirname(from_path)
    resolved = posixpath.normpath(posixpath.join(base_dir, import_spec))
    candidates = {resolved + ext for ext in _RESOLVABLE_EXTENSIONS}
    return bool(candidates & file_paths)
