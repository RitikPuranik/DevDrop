"""
ProjectManifest — Phase 3, Section 10.

The normalized internal representation of a generated project, kept
separate from schemas.code_generation.GeneratedProject on purpose:
GeneratedProject is "what the LLM returned, schema-checked in isolation";
a ProjectManifest is what's left after that output has also been
cross-checked against the Architecture contract that drove it
(project/validator.py) — this is what actually gets returned to callers
and, later, what the storage/GitHub-publish phases will consume.
"""
from pydantic import BaseModel

from schemas.code_generation import GeneratedFile, GeneratedProjectInfo


class ProjectManifest(BaseModel):
    project: GeneratedProjectInfo
    files: list[GeneratedFile]
    entryPoints: list[str]
    directories: list[str]
