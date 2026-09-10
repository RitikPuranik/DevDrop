"""
Architecture Agent output schema — Phase 2, Sections 5–6.

Section 6 lists several rules as requirements, not suggestions ("No `../`.
No absolute filesystem paths. No duplicate files."). Those are enforced
here as real Pydantic validators — a malformed path or a duplicate file
fails validation and triggers the base agent's repair-prompt retry,
exactly like a schema mismatch would. Trusting the prompt alone for
safety-relevant rules is how "please don't do X" quietly stops working
the moment a model update changes its behavior.
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from schemas.utils import assert_no_duplicate_paths, validate_relative_path


class ProjectInfo(BaseModel):
    # Fixed for the MVP (Section 5) — also matches exactly what DevDrop's
    # deployment analyzer looks for to route a repo to Vercel as react-vite
    # (backend/src/services/deployment/analyzer/frameworkRules.js).
    framework: Literal["react-vite"]
    language: Literal["javascript"]
    styling: Literal["css"]


class FileContract(BaseModel):
    path: str
    type: str = Field(description="e.g. 'configuration', 'entry', 'application', 'component'.")
    purpose: str
    props: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)

    @field_validator("path")
    @classmethod
    def safe_path(cls, v: str) -> str:
        return validate_relative_path(v)


class ArchitectureSpec(BaseModel):
    """A deterministic, machine-readable React+Vite project contract —
    this becomes Phase 3's single source of truth for code generation."""

    project: ProjectInfo
    entryPoints: list[str]
    directories: list[str]
    files: list[FileContract]

    @field_validator("entryPoints")
    @classmethod
    def safe_entry_points(cls, v: list[str]) -> list[str]:
        return [validate_relative_path(p) for p in v]

    @field_validator("directories")
    @classmethod
    def safe_directories(cls, v: list[str]) -> list[str]:
        return [validate_relative_path(p) for p in v]

    @model_validator(mode="after")
    def no_duplicate_files(self) -> "ArchitectureSpec":
        assert_no_duplicate_paths([f.path for f in self.files])
        return self

    @model_validator(mode="after")
    def entry_points_exist_in_files(self) -> "ArchitectureSpec":
        file_paths = {f.path for f in self.files}
        missing = [p for p in self.entryPoints if p not in file_paths]
        if missing:
            raise ValueError(f"entryPoints references path(s) not present in files: {missing}")
        return self
