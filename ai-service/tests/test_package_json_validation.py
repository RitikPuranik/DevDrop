"""package.json validation tests — Phase 3, Section 12."""
import copy
import json

from project.generator import build_manifest
from project.validator import validate_project
from schemas.code_generation import GeneratedProject


def _validate_with_package_json_content(valid_code_generation_payload, valid_full_architecture_payload, content: str):
    payload = copy.deepcopy(valid_code_generation_payload)
    pkg = next(f for f in payload["files"] if f["path"] == "package.json")
    pkg["content"] = content
    generated = GeneratedProject.model_validate(payload)
    manifest = build_manifest(generated, valid_full_architecture_payload)
    return validate_project(manifest, valid_full_architecture_payload)


def test_valid_package_json(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate_with_package_json_content(
        valid_code_generation_payload,
        valid_full_architecture_payload,
        json.dumps({"name": "x", "scripts": {"dev": "vite", "build": "vite build"}}),
    )
    assert not any("package.json" in e for e in result.errors)


def test_invalid_json_in_package_json(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate_with_package_json_content(
        valid_code_generation_payload, valid_full_architecture_payload, "{not valid json"
    )
    assert result.valid is False
    assert any("not valid JSON" in e for e in result.errors)


def test_missing_scripts_object(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate_with_package_json_content(
        valid_code_generation_payload, valid_full_architecture_payload, json.dumps({"name": "x"})
    )
    assert result.valid is False
    assert any("scripts" in e for e in result.errors)


def test_missing_build_script(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate_with_package_json_content(
        valid_code_generation_payload,
        valid_full_architecture_payload,
        json.dumps({"name": "x", "scripts": {"dev": "vite"}}),
    )
    assert result.valid is False
    assert any("'build' script" in e for e in result.errors)


def test_missing_dev_script(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate_with_package_json_content(
        valid_code_generation_payload,
        valid_full_architecture_payload,
        json.dumps({"name": "x", "scripts": {"build": "vite build"}}),
    )
    assert result.valid is False
    assert any("'dev' script" in e for e in result.errors)


def test_missing_name(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate_with_package_json_content(
        valid_code_generation_payload,
        valid_full_architecture_payload,
        json.dumps({"scripts": {"dev": "vite", "build": "vite build"}}),
    )
    assert result.valid is False
    assert any("'name'" in e for e in result.errors)


def test_dependencies_must_be_an_object(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate_with_package_json_content(
        valid_code_generation_payload,
        valid_full_architecture_payload,
        json.dumps({"name": "x", "scripts": {"dev": "vite", "build": "vite build"}, "dependencies": ["react"]}),
    )
    assert result.valid is False
    assert any("'dependencies'" in e for e in result.errors)
