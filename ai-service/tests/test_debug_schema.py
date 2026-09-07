"""Debug Agent output schema tests — Phase 4, Section 12."""
import pytest
from pydantic import ValidationError

from schemas.debug import DebugResult

_VALID_CHANGE = {
    "path": "src/components/Hero.jsx",
    "action": "replace",
    "reason": "fix broken import",
    "content": "export default function Hero() { return <section>hi</section> }",
}


def _result(**change_overrides) -> dict:
    change = {**_VALID_CHANGE, **change_overrides}
    return {
        "diagnosis": "test",
        "rootCause": {"category": "import", "message": "test"},
        "changes": [change],
        "confidence": 0.9,
    }


def test_valid_debug_result_passes():
    result = DebugResult.model_validate(_result())
    assert result.changes[0].action == "replace"


@pytest.mark.parametrize("bad_path", ["../../etc/passwd", "/etc/passwd", "C:\\Windows\\file.txt"])
def test_unsafe_paths_are_rejected(bad_path):
    with pytest.raises(ValidationError):
        DebugResult.model_validate(_result(path=bad_path))


@pytest.mark.parametrize(
    "placeholder_content",
    [
        "// TODO: fix this later",
        "same as above",
        "export default function Hero() { /* omitted for brevity */ }",
    ],
)
def test_placeholder_content_is_rejected(placeholder_content):
    with pytest.raises(ValidationError, match="placeholder"):
        DebugResult.model_validate(_result(content=placeholder_content))


def test_action_is_locked_to_replace():
    with pytest.raises(ValidationError):
        DebugResult.model_validate(_result(action="create"))


@pytest.mark.parametrize("confidence", [-0.1, 1.1])
def test_confidence_must_be_between_zero_and_one(confidence):
    payload = _result()
    payload["confidence"] = confidence
    with pytest.raises(ValidationError):
        DebugResult.model_validate(payload)


def test_debug_result_has_no_project_field():
    """The strongest form of Section 14 point 10 ("never change framework/
    language/styling"): there's no field to put such a change in at all."""
    assert "project" not in DebugResult.model_fields
