"""
Debug Agent output schema — Phase 4, Section 12.

Deliberately has no `project` field at all. Section 14 point 10 says the
Debug Agent must "never change framework/language/styling" — rather than
give it a field for that and validate afterward that it didn't touch it,
this schema gives it no mechanism to propose that change in the first
place. A stronger guarantee than "checked and rejected": there's nothing
to check because there's nowhere to put it.

`action` is locked to "replace" — Phase 4's patcher (project/patcher.py)
only supports replacing files that already exist in the project, matching
Section 21's "patch, don't regenerate" framing and Section 15's "file path
exists ... if allowed" (creating new files isn't allowed yet).
"""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from schemas.build import ErrorCategory
from schemas.utils import assert_not_placeholder_content, validate_relative_path


class RootCause(BaseModel):
    category: ErrorCategory
    file: str | None = None
    line: int | None = None
    message: str


class FileChange(BaseModel):
    path: str
    action: Literal["replace"]
    reason: str
    content: str

    @field_validator("path")
    @classmethod
    def safe_path(cls, v: str) -> str:
        return validate_relative_path(v)

    @field_validator("content")
    @classmethod
    def real_content(cls, v: str) -> str:
        return assert_not_placeholder_content(v)


class DebugResult(BaseModel):
    diagnosis: str
    rootCause: RootCause
    changes: list[FileChange] = Field(
        description="Prefer 1-3 files. Every entry must be a complete replacement file, not a diff."
    )
    confidence: float = Field(ge=0.0, le=1.0)
