"""
Build error normalization — Phase 4, Section 8.

Not a real JS/bundler error parser — raw Vite/esbuild/npm output is
noisy and varies by version. This extracts a useful structured guess
(file/line/column/category) where the output makes it easy, and always
keeps `rawMessage` so nothing is lost when it doesn't. Tuned against real
`vite build` output from this phase's own broken test fixtures (see
tests/test_error_parser.py), not guessed patterns — that's what caught
the two subtleties below.
"""
import re
from pathlib import Path

from schemas.build import NormalizedBuildError

# "path/to/file.jsx:12:5" or "path/to/file.jsx:12" — the common esbuild/Vite
# frame format. Vite reports these with the sandbox's absolute tmp path
# prefixed; parse_build_errors() strips that back to a relative path when
# `project_root` is given.
_FILE_LINE_COL = re.compile(r"([./\w\-]+\.(?:jsx?|css|json|html)):(\d+)(?::(\d+))?")

# "... from \"src/components/Hero.jsx\"" — Rollup/Vite's import-resolution
# error names the importing file this way, with no line:col attached, and
# already relative (no tempdir prefix) in practice.
_IMPORT_FROM_FILE = re.compile(r"""from\s+['"]([^'"]+\.(?:jsx?|css))['"]""", re.IGNORECASE)

_CATEGORY_KEYWORDS: list[tuple[str, str]] = [
    ("could not resolve", "import"),
    ("failed to resolve import", "import"),
    ("cannot find module", "import"),
    ("unexpected token", "syntax"),
    ("unexpected eof", "syntax"),
    ("syntaxerror", "syntax"),
    ("parse error", "syntax"),
    ("error: expected", "syntax"),  # esbuild's actual phrasing, e.g. `Expected ":" but found "("`
    ("transform failed", "syntax"),
    ("npm error", "dependency"),
    ("no matching version", "dependency"),
    ("eresolve", "dependency"),
    ("enoent", "asset"),
    ("module not found", "module"),
    ("cannot read propert", "runtime"),
    ("is not defined", "runtime"),
]

_ERROR_LINE_MARKERS = ("error", "✘", "failed", "cannot", "could not", "unexpected", "npm error", "fatal")


def categorize(message: str) -> str:
    lowered = message.lower()
    for keyword, category in _CATEGORY_KEYWORDS:
        if keyword in lowered:
            return category
    return "unknown"


def _looks_like_an_error_line(line: str) -> bool:
    # JS/Node stack-trace frames ("    at someFunction (file:line:col)")
    # are noise, not the error itself — and a real capture showed why this
    # can't just be "no error keywords": esbuild's own internal function
    # name `failureErrorWithLog` contains the substring "Error", which
    # would otherwise false-trigger the marker check below on every frame
    # of its stack trace.
    if line.startswith("at "):
        return False
    lowered = line.lower()
    return any(marker in lowered for marker in _ERROR_LINE_MARKERS)


def _relativize(path_str: str, project_root: Path | None) -> str:
    if project_root is None:
        return path_str
    try:
        candidate = Path(path_str)
        if candidate.is_absolute():
            return str(candidate.relative_to(project_root))
    except ValueError:
        pass  # not actually under project_root -- leave it as-is
    return path_str


def parse_build_errors(
    stdout: str, stderr: str, project_root: Path | None = None, max_errors: int = 50
) -> list[NormalizedBuildError]:
    combined = f"{stdout}\n{stderr}"
    errors: list[NormalizedBuildError] = []
    seen_lines: set[str] = set()

    for raw_line in combined.splitlines():
        if len(errors) >= max_errors:
            break
        line = raw_line.strip()
        if not line or line in seen_lines or not _looks_like_an_error_line(line):
            continue
        seen_lines.add(line)

        file_path: str | None = None
        line_no: int | None = None
        col_no: int | None = None

        file_line_match = _FILE_LINE_COL.search(line)
        if file_line_match:
            file_path = _relativize(file_line_match.group(1), project_root)
            line_no = int(file_line_match.group(2))
            col_no = int(file_line_match.group(3)) if file_line_match.group(3) else None
        else:
            from_match = _IMPORT_FROM_FILE.search(line)
            if from_match:
                file_path = from_match.group(1)

        errors.append(
            NormalizedBuildError(
                file=file_path,
                line=line_no,
                column=col_no,
                message=line[:500],
                category=categorize(line),
                rawMessage=raw_line[:1000],
            )
        )

    return errors


def truncate_output(text: str, max_chars: int) -> str:
    """Keep the head and tail, drop the middle — compiler errors are
    usually at the end, but the head can carry useful context too."""
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return f"{text[:half]}\n...[truncated — {len(text)} chars total]...\n{text[-half:]}"


def select_affected_files(
    manifest_files: dict[str, str], errors: list[NormalizedBuildError], fallback_paths: list[str]
) -> dict[str, str]:
    """Section 36: focused context for the Debug Agent, not the whole
    project. `manifest_files` maps path -> content for every generated
    file. Returns just the ones the normalized errors actually name,
    falling back to `fallback_paths` (e.g. the entry files) when no error
    could be tied to a specific file at all — that fallback exists so the
    Debug Agent still has *something* concrete rather than nothing."""
    paths = {e.file for e in errors if e.file and e.file in manifest_files}
    if not paths:
        paths = {p for p in fallback_paths if p in manifest_files}
    return {path: manifest_files[path] for path in paths}
