"""Build result schema tests — Phase 4, Section 7."""
import pytest
from pydantic import ValidationError

from schemas.build import BuildResult, NormalizedBuildError


@pytest.mark.parametrize("status", ["success", "failed", "timeout", "blocked"])
def test_all_four_statuses_are_valid(status):
    result = BuildResult(status=status, exitCode=0 if status == "success" else 1)
    assert result.status == status


def test_invalid_status_is_rejected():
    with pytest.raises(ValidationError):
        BuildResult(status="crashed")  # not one of the four allowed states


def test_defaults_are_sane():
    result = BuildResult(status="success")
    assert result.exitCode is None
    assert result.stdout == ""
    assert result.stderr == ""
    assert result.durationMs == 0
    assert result.errors == []
    assert result.warnings == []


def test_normalized_error_defaults():
    error = NormalizedBuildError(message="something broke", rawMessage="raw: something broke")
    assert error.file is None
    assert error.line is None
    assert error.category == "unknown"


def test_invalid_category_is_rejected():
    with pytest.raises(ValidationError):
        NormalizedBuildError(message="x", rawMessage="x", category="not-a-real-category")
