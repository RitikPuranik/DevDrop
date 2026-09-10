"""Build result schema — Phase 4, Sections 7–8."""
from typing import Literal

from pydantic import BaseModel, Field

BuildStatus = Literal["success", "failed", "timeout", "blocked"]

ErrorCategory = Literal[
    "syntax", "import", "module", "dependency", "configuration", "asset", "runtime", "unknown"
]


class NormalizedBuildError(BaseModel):
    """A best-effort structured extraction from raw compiler/bundler
    output. `rawMessage` always carries the original line so nothing is
    lost if the normalization missed something — this is a convenience
    layer for the Debug Agent, not a full JS toolchain error parser."""

    file: str | None = None
    line: int | None = None
    column: int | None = None
    message: str
    category: ErrorCategory = "unknown"
    rawMessage: str


class BuildResult(BaseModel):
    status: BuildStatus
    exitCode: int | None = None
    stdout: str = ""
    stderr: str = ""
    durationMs: int = 0
    errors: list[NormalizedBuildError] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
