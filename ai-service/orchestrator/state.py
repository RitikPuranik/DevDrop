"""
Pipeline state — Phase 2 Section 11, extended by Phase 4 Section 18.

Deliberately minimal: an in-memory record of where one pipeline run is and
what it's produced so far. A persistent/queryable job system is Phase 1
spec Section 9 territory (later phases) — this only needs to survive one
pipeline run, in-process.
"""
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class PipelineStage(StrEnum):
    QUEUED = "QUEUED"
    ANALYZING_REQUIREMENTS = "ANALYZING_REQUIREMENTS"
    CREATING_DESIGN = "CREATING_DESIGN"
    CREATING_ARCHITECTURE = "CREATING_ARCHITECTURE"
    GENERATING_CODE = "GENERATING_CODE"
    VALIDATING_PROJECT = "VALIDATING_PROJECT"
    BUILDING = "BUILDING"
    DEBUGGING = "DEBUGGING"
    PATCHING = "PATCHING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    # Section 18 also names "REBUILDING" and "BUILD_COMPLETE"/"BUILD_FAILED"
    # as example stages. Deliberately not added as separate values: a
    # rebuild is just another pass through BUILDING (repairAttempt below
    # already distinguishes which attempt it is, more precisely than a
    # same-meaning "REBUILDING" label would), and COMPLETED/FAILED already
    # serve as this pipeline's terminal states for every other stage —
    # adding build-specific synonyms for the same two concepts would be two
    # ways to say the same thing rather than a new distinction.


class PipelineState(BaseModel):
    jobId: str
    stage: PipelineStage = PipelineStage.QUEUED
    completedStages: list[str] = Field(default_factory=list)
    failedStages: list[str] = Field(default_factory=list)
    outputs: dict[str, Any] = Field(default_factory=dict)
    error: dict[str, Any] | None = None

    # --- Phase 4 additions (Section 18) ---
    # Updated on every loop iteration, not just once — unlike outputs[...],
    # which is only set when a stage finally *completes*, these track the
    # latest state of an in-progress repair loop so a caller (or a log
    # line) can see where things stand even mid-loop.
    buildResult: dict[str, Any] | None = None
    debugResult: dict[str, Any] | None = None
    repairAttempt: int = 0
    finalProject: dict[str, Any] | None = None

    def mark_stage_complete(self, stage_name: str, output: dict) -> None:
        self.completedStages.append(stage_name)
        self.outputs[stage_name] = output

    def mark_failed(self, stage_name: str, code: str, message: str) -> None:
        self.failedStages.append(stage_name)
        self.stage = PipelineStage.FAILED
        self.error = {"code": code, "stage": stage_name, "message": message}
