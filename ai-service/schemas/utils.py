"""
Shared schema utility for every agent.

Gemini's structured-output support for JSON Schema's `$ref`/`$defs`
(what pydantic's `.model_json_schema()` emits for any nested model) has
been inconsistent across model versions and SDKs — multiple frameworks
(litellm, pydantic-ai, MCP tool schemas) hit outright 400 errors on
`$ref` before Google's January 2026 update, and even that update is
scoped to newer models and still doesn't cover recursive/self-referential
schemas. None of our schemas are recursive, but rather than make every
agent's correctness depend on exactly which GEMINI_MODEL a deployment has
configured, every agent flattens its schema before it's ever sent to a
provider. This is pure insurance: a flattened schema is valid input either
way, whether or not the configured model natively understands `$ref`.

Also holds the file-path-safety, duplicate-path, and placeholder-content
checks shared by every schema that describes generated files
(Architecture in Phase 2; Code Generation in Phase 3; Debug patches in
Phase 4) — one implementation each, reused, not copy-pasted per schema.
"""
import re
from typing import Any

from pydantic import BaseModel


def flatten_schema(model: type[BaseModel]) -> dict[str, Any]:
    """Return a JSON Schema for `model` with all `$defs`/`$ref` inlined —
    no references anywhere in the output, safe to hand to any provider
    regardless of its `$ref` support.

    Also strips `additionalProperties` from every object in the schema.
    Pydantic's `.model_json_schema()` adds `additionalProperties: false`
    to every object by default, but the Gemini Developer API (unlike
    Vertex AI / Gemini Enterprise Agent Platform) rejects that keyword
    outright — every request fails with "additionalProperties is only
    supported in Gemini Enterprise Agent Platform mode, not in Gemini
    Developer API mode." This is a known, longstanding gap between what
    Pydantic emits and what the Developer API's schema validator accepts
    (the same keyword trips up tool-call schemas for other libraries
    talking to Gemini too), so every schema goes through this stripping
    step before it's ever sent to a provider, the same way $ref inlining
    already is."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def _resolve(node: Any, seen: frozenset[str]) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref_name = node["$ref"].rsplit("/", 1)[-1]
                if ref_name in seen:
                    # A genuinely recursive schema would infinite-loop here.
                    # None of ours are, but fail loudly instead of hanging
                    # if one ever is.
                    raise ValueError(
                        f"Recursive schema reference detected at '{ref_name}' — "
                        "flatten_schema() does not support recursive models."
                    )
                target = dict(defs.get(ref_name, {}))
                # Sibling keys next to a $ref (e.g. a field-level description)
                # take precedence over the definition's own.
                target.update({k: v for k, v in node.items() if k != "$ref"})
                return _resolve(target, seen | {ref_name})
            return {
                k: _resolve(v, seen)
                for k, v in node.items()
                if k not in ("additionalProperties", "propertyNames")
            }
        if isinstance(node, list):
            return [_resolve(item, seen) for item in node]
        return node

    return _resolve(schema, frozenset())


def validate_relative_path(path: str) -> str:
    """Reject anything that isn't a clean, relative, within-the-project
    path: no leading '/', no '~', no drive letters, no '..' or bare '.'
    segments. Used as a field_validator by every schema describing
    generated files."""
    normalized = path.replace("\\", "/").strip()
    if not normalized:
        raise ValueError("File path cannot be empty.")
    if normalized.startswith("/") or normalized.startswith("~") or re.match(r"^[A-Za-z]:", normalized):
        raise ValueError(f"'{path}' looks like an absolute path — paths must be relative to the project root.")
    segments = normalized.split("/")
    if ".." in segments:
        raise ValueError(f"'{path}' contains '..' — path traversal outside the project root is not allowed.")
    if "." in segments:
        raise ValueError(f"'{path}' contains a bare '.' path segment.")
    return normalized


def assert_no_duplicate_paths(paths: list[str]) -> None:
    """Raise ValueError if `paths` contains any repeats — used as a
    model_validator by every schema describing a list of generated files."""
    seen: set[str] = set()
    dupes: set[str] = set()
    for p in paths:
        (dupes if p in seen else seen).add(p)
    if dupes:
        raise ValueError(f"Duplicate file path(s): {sorted(dupes)}")


# Matched case-insensitively. Deliberately phrase-level rather than a bare
# `\bTODO\b` — a portfolio project's own content can legitimately contain
# the word "todo" (e.g. a listed project called "Todo App"); these patterns
# target the placeholder MARKERS specifically (comment-style TODOs, and
# distinctive multi-word phrases) rather than the word in isolation.
_PLACEHOLDER_PATTERNS = [
    re.compile(r"//\s*TODO\b", re.IGNORECASE),
    re.compile(r"/\*\s*TODO\b", re.IGNORECASE),
    re.compile(r"#\s*TODO\b", re.IGNORECASE),
    re.compile(r"\bTODO:", re.IGNORECASE),
    re.compile(r"//\s*FIXME\b", re.IGNORECASE),
    re.compile(r"\bimplement this\b", re.IGNORECASE),
    re.compile(r"\bsame as above\b", re.IGNORECASE),
    re.compile(r"\bomitted for brevity\b", re.IGNORECASE),
    re.compile(r"\brest of the (?:code|component|file)\b", re.IGNORECASE),
    re.compile(r"\bplaceholder\b", re.IGNORECASE),
]


def assert_not_placeholder_content(content: str) -> str:
    """Reject empty content and unfinished-code markers ("// TODO",
    "implement this", "same as above", ...). Used by any schema describing
    real, supposedly-complete file content — GeneratedFile (Phase 3) and
    FileChange (Phase 4's Debug Agent patches) both need the exact same
    guarantee: what comes back from the model must be finished code, not a
    stub. Returns `content` unchanged so it can be used directly as a
    field_validator body."""
    if not content.strip():
        raise ValueError("File content cannot be empty.")
    for pattern in _PLACEHOLDER_PATTERNS:
        if pattern.search(content):
            raise ValueError(
                f"Content looks like a placeholder, not finished file content "
                f"(matched pattern: {pattern.pattern!r})."
            )
    return content