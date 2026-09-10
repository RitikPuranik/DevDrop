"""Tests for schemas.utils.flatten_schema — the $ref/$defs flattening this
whole phase's Gemini-compatibility decision rests on."""
import json

import pytest
from pydantic import BaseModel

from schemas.architecture import ArchitectureSpec
from schemas.code_generation import GeneratedProject
from schemas.design import DesignSpec
from schemas.requirements import RequirementsSpec
from schemas.utils import flatten_schema


def _assert_no_refs(node) -> None:
    """Recursively assert no $ref/$defs survive anywhere in the schema."""
    if isinstance(node, dict):
        assert "$ref" not in node
        assert "$defs" not in node
        for value in node.values():
            _assert_no_refs(value)
    elif isinstance(node, list):
        for item in node:
            _assert_no_refs(item)


@pytest.mark.parametrize("model", [RequirementsSpec, DesignSpec, ArchitectureSpec, GeneratedProject])
def test_flatten_schema_removes_all_refs(model):
    flat = flatten_schema(model)
    _assert_no_refs(flat)
    # And it must still be valid, JSON-serializable output.
    json.dumps(flat)


def test_flatten_schema_preserves_nested_field_info():
    flat = flatten_schema(DesignSpec)
    colors = flat["properties"]["designSystem"]["properties"]["colors"]["properties"]
    assert "primary" in colors


class _Node(BaseModel):
    name: str
    child: "_Node | None" = None


def test_flatten_schema_raises_on_recursive_model():
    with pytest.raises(ValueError, match="Recursive"):
        flatten_schema(_Node)
