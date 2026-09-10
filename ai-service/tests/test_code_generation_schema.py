"""Code Generation schema tests — Phase 3, Sections 1–3."""
import copy

import pytest
from pydantic import ValidationError

from schemas.code_generation import GeneratedProject


def test_valid_project_passes(valid_code_generation_payload):
    result = GeneratedProject.model_validate(valid_code_generation_payload)
    assert len(result.files) == 13
    assert result.project.framework == "react-vite"


@pytest.mark.parametrize(
    "bad_path",
    [
        "../../secret.txt",
        "../package.json",
        "C:\\Windows\\System32\\file.txt",
        "/etc/passwd",
        "",
    ],
)
def test_forbidden_paths_are_rejected(valid_code_generation_payload, bad_path):
    payload = copy.deepcopy(valid_code_generation_payload)
    payload["files"][0]["path"] = bad_path
    with pytest.raises(ValidationError):
        GeneratedProject.model_validate(payload)


@pytest.mark.parametrize(
    "good_path",
    ["package.json", "src/App.jsx", "src/components/Hero.jsx", "src/styles/global.css"],
)
def test_allowed_paths_pass(good_path):
    payload = {
        "project": {"name": "x", "framework": "react-vite", "language": "javascript", "styling": "css"},
        "files": [{"path": good_path, "type": "configuration", "purpose": "x", "content": "console.log('ok')"}],
    }
    result = GeneratedProject.model_validate(payload)
    assert result.files[0].path == good_path


def test_duplicate_paths_are_rejected(valid_code_generation_payload):
    payload = copy.deepcopy(valid_code_generation_payload)
    payload["files"].append(dict(payload["files"][0]))
    with pytest.raises(ValidationError, match="Duplicate"):
        GeneratedProject.model_validate(payload)


@pytest.mark.parametrize("field,bad_value", [("framework", "next-js"), ("language", "typescript"), ("styling", "tailwind")])
def test_wrong_project_metadata_is_rejected(valid_code_generation_payload, field, bad_value):
    payload = copy.deepcopy(valid_code_generation_payload)
    payload["project"][field] = bad_value
    with pytest.raises(ValidationError):
        GeneratedProject.model_validate(payload)


def test_invalid_file_type_is_rejected(valid_code_generation_payload):
    payload = copy.deepcopy(valid_code_generation_payload)
    payload["files"][0]["type"] = "executable"  # not in the allowed FileType list
    with pytest.raises(ValidationError):
        GeneratedProject.model_validate(payload)


def test_empty_content_is_rejected(valid_code_generation_payload):
    payload = copy.deepcopy(valid_code_generation_payload)
    payload["files"][0]["content"] = "   "
    with pytest.raises(ValidationError, match="empty"):
        GeneratedProject.model_validate(payload)


@pytest.mark.parametrize(
    "placeholder_content",
    [
        "// TODO: finish this component\nfunction Hero() { return null }",
        "/* TODO implement */\nexport default function Hero() {}",
        "function Hero() {\n  // same as above\n  return null\n}",
        "function Hero() {\n  return null // omitted for brevity\n}",
        "function Hero() {\n  return <div>placeholder</div>\n}",
    ],
)
def test_placeholder_content_is_rejected(valid_code_generation_payload, placeholder_content):
    payload = copy.deepcopy(valid_code_generation_payload)
    payload["files"][0]["content"] = placeholder_content
    with pytest.raises(ValidationError, match="placeholder"):
        GeneratedProject.model_validate(payload)


def test_legitimate_content_mentioning_todo_as_a_word_is_not_flagged(valid_code_generation_payload):
    # A "Todo App" project the user actually built is legitimate content,
    # not an unfinished-code marker — the check targets marker PATTERNS
    # ("// TODO", "TODO:"), not the bare word.
    payload = copy.deepcopy(valid_code_generation_payload)
    payload["files"][0]["content"] = (
        "function Projects() {\n  return <p>Built a Todo List app in React.</p>\n}"
    )
    result = GeneratedProject.model_validate(payload)
    assert "Todo List" in result.files[0].content
