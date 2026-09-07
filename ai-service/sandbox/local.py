"""
Local development sandbox — Phase 4, Sections 3, 5, 6, 9–10.

Development-only. OS-level subprocess isolation inside a temp directory —
NOT a hardened production boundary. See README's Security Model section
before this is ever pointed at untrusted callers at scale: it does not
sandbox network access, does not limit CPU/memory, and shares the host
kernel with everything else in this process. Section 25's abstraction
(BuildSandbox) exists specifically so a container/VM-backed implementation
can replace this later without the orchestrator changing at all.
"""
import asyncio
import json
import logging
import tempfile
import time
from pathlib import Path

from build.command_validator import UnsafeScriptError, validate_package_scripts
from build.error_parser import parse_build_errors, truncate_output
from config import Settings, get_settings
from project.manifest import ProjectManifest
from sandbox.base import BuildSandbox
from schemas.build import BuildResult

logger = logging.getLogger(__name__)


class _BuildTimeoutError(Exception):
    pass


class LocalSandbox(BuildSandbox):
    def __init__(self, settings: Settings | None = None):
        self._settings = settings or get_settings()

    async def build(self, project: ProjectManifest) -> BuildResult:
        start = time.monotonic()

        with tempfile.TemporaryDirectory(prefix="devdrop-build-") as tmpdir:
            root = Path(tmpdir).resolve()
            self._materialize(project, root)

            try:
                package_json = json.loads((root / "package.json").read_text(encoding="utf-8"))
            except (FileNotFoundError, json.JSONDecodeError) as exc:
                return self._result(start, "blocked", stderr=f"Invalid package.json: {exc}")

            try:
                validate_package_scripts(package_json)
            except UnsafeScriptError as exc:
                logger.warning("build_blocked", extra={"reason": str(exc)})
                return self._result(start, "blocked", stderr=str(exc))

            timeout = self._settings.build_timeout_seconds

            try:
                install = await self._run(["npm", "install", "--no-audit", "--no-fund"], root, timeout)
            except _BuildTimeoutError:
                return self._result(start, "timeout", stderr="npm install exceeded the build timeout.")

            if install.returncode != 0:
                return self._result(start, "failed", stdout=install.stdout, stderr=install.stderr, exit_code=install.returncode, project_root=root)

            remaining = max(1.0, timeout - (time.monotonic() - start))
            try:
                build = await self._run(["npm", "run", "build"], root, remaining)
            except _BuildTimeoutError:
                return self._result(start, "timeout", stderr="npm run build exceeded the build timeout.")

            status = "success" if build.returncode == 0 else "failed"
            return self._result(start, status, stdout=build.stdout, stderr=build.stderr, exit_code=build.returncode, project_root=root)

    def _materialize(self, project: ProjectManifest, root: Path) -> None:
        for f in project.files:
            # f.path is already validated as safe/relative by the schema
            # (schemas.utils.validate_relative_path) — this re-checks
            # containment anyway before anything touches disk, on the
            # principle that a filesystem write is exactly the kind of
            # operation that should never trust a single upstream check.
            target = (root / f.path).resolve()
            if not target.is_relative_to(root):
                raise ValueError(f"Refusing to materialize '{f.path}' — resolves outside the sandbox root.")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(f.content, encoding="utf-8")

    async def _run(self, argv: list[str], cwd: Path, timeout: float):
        # Explicit argument array, never shell=True (Section 5) — nothing
        # here is a string a shell could reinterpret.
        process = await asyncio.create_subprocess_exec(
            *argv,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            stdout_bytes, stderr_bytes = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()  # reap it — wait_for timing out doesn't kill the process on its own
            raise _BuildTimeoutError from None

        return _CommandOutput(
            returncode=process.returncode,
            stdout=stdout_bytes.decode("utf-8", errors="replace"),
            stderr=stderr_bytes.decode("utf-8", errors="replace"),
        )

    def _result(
        self,
        start: float,
        status: str,
        stdout: str = "",
        stderr: str = "",
        exit_code: int | None = None,
        project_root: Path | None = None,
    ) -> BuildResult:
        max_chars = self._settings.max_build_output_chars
        stdout = truncate_output(stdout, max_chars)
        stderr = truncate_output(stderr, max_chars)
        errors = parse_build_errors(stdout, stderr, project_root=project_root) if status in ("failed", "timeout") else []
        return BuildResult(
            status=status,
            exitCode=exit_code,
            stdout=stdout,
            stderr=stderr,
            durationMs=int((time.monotonic() - start) * 1000),
            errors=errors,
        )


class _CommandOutput:
    def __init__(self, returncode: int | None, stdout: str, stderr: str):
        self.returncode = returncode
        self.stdout = stdout
        self.stderr = stderr
