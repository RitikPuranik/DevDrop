"""
Error parser tests — Phase 4, Section 8.

The multi-line strings below are excerpts of REAL `vite build` output,
captured while building this phase's own test fixtures through the actual
LocalSandbox (see this phase's manual verification — the exact commands
are in the PR/session notes, not reproduced here). Testing against real
compiler output, not a guessed format, is what caught two real bugs
during development: absolute tempdir-prefixed paths that wouldn't match
the manifest's relative paths, and esbuild's own internal function name
`failureErrorWithLog` containing the substring "Error" and false-triggering
the naive marker check.
"""
from pathlib import Path

from build.error_parser import categorize, parse_build_errors, select_affected_files, truncate_output

_REAL_IMPORT_FAILURE_STDERR = """\
x Build failed in 409ms
error during build:
Could not resolve "../data/doesNotExist.js" from "src/components/Hero.jsx"
file: /tmp/devdrop-build-a7yviabz/src/components/Hero.jsx
    at getRollupError (file:///tmp/devdrop-build-a7yviabz/node_modules/rollup/dist/es/shared/parseAst.js:317:41)
    at error (file:///tmp/devdrop-build-a7yviabz/node_modules/rollup/dist/es/shared/parseAst.js:313:42)
"""

_REAL_SYNTAX_FAILURE_STDERR = """\
x Build failed in 156ms
error during build:
[vite:esbuild] Transform failed with 1 error:
/tmp/devdrop-build-n0v0wd6t/src/components/Hero.jsx:4:9: ERROR: Expected ":" but found "("
    at failureErrorWithLog (/tmp/devdrop-build-n0v0wd6t/node_modules/esbuild/lib/main.js:1472:15)
    at /tmp/devdrop-build-n0v0wd6t/node_modules/esbuild/lib/main.js:945:25
"""


def test_real_import_failure_identifies_the_relative_file():
    errors = parse_build_errors("", _REAL_IMPORT_FAILURE_STDERR, project_root=Path("/tmp/devdrop-build-a7yviabz"))
    import_errors = [e for e in errors if e.category == "import"]
    assert len(import_errors) == 1
    assert import_errors[0].file == "src/components/Hero.jsx"


def test_real_syntax_failure_identifies_file_line_and_column():
    errors = parse_build_errors("", _REAL_SYNTAX_FAILURE_STDERR, project_root=Path("/tmp/devdrop-build-n0v0wd6t"))
    syntax_errors = [e for e in errors if e.file == "src/components/Hero.jsx"]
    assert len(syntax_errors) == 1
    assert syntax_errors[0].line == 4
    assert syntax_errors[0].column == 9
    assert syntax_errors[0].category == "syntax"


def test_stack_trace_frames_are_not_misdetected_as_errors():
    """The real bug this guards against: esbuild's own function name
    `failureErrorWithLog` contains the substring "Error", which a naive
    keyword check would treat as an error line even though it's just a
    stack-trace frame naming esbuild's own internals, not the project's."""
    errors = parse_build_errors("", _REAL_SYNTAX_FAILURE_STDERR)
    assert not any("main.js" in (e.file or "") for e in errors)
    assert not any(e.rawMessage.strip().startswith("at ") for e in errors)


def test_without_project_root_paths_stay_absolute():
    errors = parse_build_errors("", _REAL_IMPORT_FAILURE_STDERR)  # no project_root given
    import_errors = [e for e in errors if e.category == "import"]
    # The "from" clause is already relative in Vite's own phrasing, so this
    # one still comes back clean even without a root to strip.
    assert import_errors[0].file == "src/components/Hero.jsx"


def test_categorize_common_patterns():
    assert categorize('Could not resolve "./x" from "y"') == "import"
    assert categorize("SyntaxError: Unexpected token") == "syntax"
    assert categorize('ERROR: Expected ":" but found "("') == "syntax"
    assert categorize("npm error code ETARGET") == "dependency"
    assert categorize("something completely unrecognized happened") == "unknown"


def test_max_errors_is_respected():
    noisy = "\n".join(f"Error: problem number {i}" for i in range(100))
    errors = parse_build_errors(noisy, "", max_errors=10)
    assert len(errors) == 10


def test_truncate_output_short_text_unchanged():
    assert truncate_output("short", max_chars=100) == "short"


def test_truncate_output_long_text_keeps_head_and_tail():
    text = "A" * 50 + "B" * 50
    truncated = truncate_output(text, max_chars=20)
    assert truncated.startswith("A" * 5)
    assert truncated.endswith("B" * 5)
    assert "truncated" in truncated
    assert len(truncated) < len(text)


def test_select_affected_files_uses_error_file_paths():
    manifest_files = {"src/components/Hero.jsx": "hero content", "src/App.jsx": "app content"}
    errors = parse_build_errors("", _REAL_IMPORT_FAILURE_STDERR, project_root=Path("/tmp/devdrop-build-a7yviabz"))

    affected = select_affected_files(manifest_files, errors, fallback_paths=["src/main.jsx"])

    assert affected == {"src/components/Hero.jsx": "hero content"}


def test_select_affected_files_falls_back_when_no_file_identified():
    manifest_files = {"src/main.jsx": "main content", "src/App.jsx": "app content"}
    unparseable_errors = []  # nothing named a specific file

    affected = select_affected_files(manifest_files, unparseable_errors, fallback_paths=["src/main.jsx"])

    assert affected == {"src/main.jsx": "main content"}
