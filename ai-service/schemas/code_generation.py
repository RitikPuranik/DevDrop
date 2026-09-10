"""
Code Generation Agent output schema — Phase 3, Sections 1–3.

Reuses schemas.utils' path/duplicate/placeholder helpers (the same ones
ArchitectureSpec and, as of Phase 4, DebugResult use) rather than
re-implementing them.
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from schemas.utils import assert_no_duplicate_paths, assert_not_placeholder_content, validate_relative_path

FileType = Literal[
    "configuration", "entry", "application", "component", "style", "data", "asset-reference"
]


class GeneratedFile(BaseModel):
    path: str
    type: FileType
    purpose: str
    content: str

    @field_validator("path")
    @classmethod
    def safe_path(cls, v: str) -> str:
        return validate_relative_path(v)

    @field_validator("content")
    @classmethod
    def real_content(cls, v: str) -> str:
        return assert_not_placeholder_content(v)


class GeneratedProjectInfo(BaseModel):
    name: str
    # Locked for this MVP — same rationale as ArchitectureSpec.project.
    framework: Literal["react-vite"]
    language: Literal["javascript"]
    styling: Literal["css"]


class GeneratedProject(BaseModel):
    """The Code Generation Agent's raw structured output — validated here
    for shape and safety in isolation. Cross-checking against the
    Architecture contract (does this actually match what was planned?)
    happens separately in project/validator.py, since that check needs the
    Architecture output as context, which isn't visible to this schema."""

    project: GeneratedProjectInfo
    files: list[GeneratedFile]

    @model_validator(mode="after")
    def no_duplicate_files(self) -> "GeneratedProject":
        assert_no_duplicate_paths([f.path for f in self.files])
        return self
