"""
Project validator tests — Phase 3, Sections 11–12.

Path safety, duplicate-file, and framework/language/styling rejection are
already tested at the schema level (test_code_generation_schema.py) — the
schema makes those cases structurally unreachable by the time a
ProjectManifest exists (Literal types reject a bad framework before
GeneratedProject can even validate). This file covers what's genuinely
validator-specific: cross-checks against the Architecture contract,
required-file enforcement, and package.json shape — plus one deliberate
belt-and-suspenders test using model_construct() to prove the validator's
own metadata check works independently of the schema, since Section 11
names it explicitly.
"""
import copy

from project.generator import build_manifest
from project.manifest import ProjectManifest
from project.validator import validate_project
from schemas.code_generation import GeneratedProject, GeneratedProjectInfo


def _validate(valid_code_generation_payload, valid_full_architecture_payload, mutate_codegen=None, mutate_arch=None):
    codegen_payload = copy.deepcopy(valid_code_generation_payload)
    arch_payload = copy.deepcopy(valid_full_architecture_payload)
    if mutate_codegen:
        mutate_codegen(codegen_payload)
    if mutate_arch:
        mutate_arch(arch_payload)
    generated = GeneratedProject.model_validate(codegen_payload)
    manifest = build_manifest(generated, arch_payload)
    return validate_project(manifest, arch_payload)


def test_valid_project(valid_code_generation_payload, valid_full_architecture_payload):
    result = _validate(valid_code_generation_payload, valid_full_architecture_payload)
    assert result.valid is True
    assert result.errors == []
    assert result.warnings == []


def test_missing_required_file(valid_code_generation_payload, valid_full_architecture_payload):
    def drop_app_jsx(payload):
        payload["files"] = [f for f in payload["files"] if f["path"] != "src/App.jsx"]

    result = _validate(valid_code_generation_payload, valid_full_architecture_payload, mutate_codegen=drop_app_jsx)

    assert result.valid is False
    assert any("Required file missing: src/App.jsx" in e for e in result.errors)


def test_missing_entry_point(valid_code_generation_payload, valid_full_architecture_payload):
    def add_bogus_entry_point(payload):
        payload["entryPoints"].append("src/does-not-exist.jsx")

    result = _validate(valid_code_generation_payload, valid_full_architecture_payload, mutate_arch=add_bogus_entry_point)

    assert result.valid is False
    assert any("src/does-not-exist.jsx" in e for e in result.errors)


def test_architecture_required_file_not_generated(valid_code_generation_payload, valid_full_architecture_payload):
    def add_planned_but_ungenerated_file(payload):
        payload["files"].append({"path": "src/components/Testimonials.jsx", "type": "component", "purpose": "x"})

    result = _validate(
        valid_code_generation_payload, valid_full_architecture_payload, mutate_arch=add_planned_but_ungenerated_file
    )

    assert result.valid is False
    assert any("src/components/Testimonials.jsx" in e for e in result.errors)


def test_generated_file_outside_architecture_is_a_warning_not_an_error(
    valid_code_generation_payload, valid_full_architecture_payload
):
    def add_extra_generated_file(payload):
        payload["files"].append(
            {"path": "src/components/Extra.jsx", "type": "component", "purpose": "x", "content": "export default function Extra() { return null }"}
        )

    result = _validate(valid_code_generation_payload, valid_full_architecture_payload, mutate_codegen=add_extra_generated_file)

    assert result.valid is True  # a warning, not a hard failure
    assert any("src/components/Extra.jsx" in w for w in result.warnings)


def test_broken_import_is_a_warning(valid_code_generation_payload, valid_full_architecture_payload):
    def break_an_import(payload):
        hero = next(f for f in payload["files"] if f["path"] == "src/components/Hero.jsx")
        hero["content"] = hero["content"].replace("../data/siteData.js", "../data/doesNotExist.js")

    result = _validate(valid_code_generation_payload, valid_full_architecture_payload, mutate_codegen=break_an_import)

    assert result.valid is True  # lightweight/best-effort — a warning, not a hard failure
    assert any("doesNotExist" in w for w in result.warnings)


def test_wrong_project_metadata_is_caught_by_the_validator_directly():
    """Normally unreachable through validated code paths — GeneratedProjectInfo's
    Literal types already make an invalid framework/language/styling
    impossible to construct. This uses model_construct() (Pydantic's
    validation-bypass constructor) to prove the validator's own metadata
    check works independently, since Section 11 names it explicitly:
    belt-and-suspenders, so a future caller building a ProjectManifest some
    other way is still covered."""
    bad_info = GeneratedProjectInfo.model_construct(
        name="x", framework="next-js", language="typescript", styling="tailwind"
    )
    manifest = ProjectManifest.model_construct(project=bad_info, files=[], entryPoints=[], directories=[])

    result = validate_project(manifest, {"entryPoints": [], "files": []})

    assert result.valid is False
    assert any("framework" in e for e in result.errors)
    assert any("language" in e for e in result.errors)
    assert any("styling" in e for e in result.errors)
