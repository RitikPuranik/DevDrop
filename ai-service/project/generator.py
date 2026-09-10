"""
Project generator — Phase 3, Section 18.

Turns a schema-validated GeneratedProject into a normalized
ProjectManifest. Path safety, duplicate-file, and placeholder-content
checks already happened at the schema level (schemas/code_generation.py)
by the time a GeneratedProject exists at all — this only adds what that
output doesn't restate: entryPoints/directories, carried over from the
Architecture contract that drove the generation in the first place.
"""
from project.manifest import ProjectManifest
from schemas.code_generation import GeneratedProject


def build_manifest(generated: GeneratedProject, architecture: dict) -> ProjectManifest:
    return ProjectManifest(
        project=generated.project,
        files=generated.files,
        entryPoints=architecture.get("entryPoints", []),
        directories=architecture.get("directories", []),
    )
