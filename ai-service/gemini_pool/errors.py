"""
Central Gemini error classifier — Section 16.

One place decides what kind of failure a Gemini call produced; nothing
else (the pooled provider, the scheduler, an agent) re-implements this
logic. See ERROR_CLASS_META at the bottom for how each classification
maps to a project status transition and a retry/failover decision —
Section 16's own mapping table, kept as data next to the classifier that
produces it rather than scattered across callers.

Classification is based on `google.genai.errors.APIError` (and its
`ClientError`/`ServerError` subclasses), which exposes `.code` (HTTP
status), `.status` (the API's own status string, e.g.
"RESOURCE_EXHAUSTED", "PERMISSION_DENIED") and `.message`. Verified
against the installed google-genai==2.21.0 source
(google/genai/errors.py) — Gemini's quota errors all surface as a single
HTTP 429 / RESOURCE_EXHAUSTED regardless of *which* quota was hit (RPM vs
TPM vs RPD), so distinguishing them means pattern-matching the quota
metric name Google puts in the error message/details (e.g.
"GenerateRequestsPerMinutePerProjectPerModel",
"GenerateContentInputTokensPerModelPerMinute",
"GenerateRequestsPerDayPerProjectPerModel"). This is inherently a bit
fuzzy — if Google changes these metric names, the RPM/TPM/RPD split
degrades to "some kind of rate limit, guess RPM" rather than breaking
outright (see `_classify_resource_exhausted`'s fallback). Not verified
against a live 429 response in this sandbox (no network route to
Gemini's API here, same limitation every phase of this service has
documented) — worth confirming the exact metric strings against a real
rate-limited response before leaning on this split in production.
"""
import re
from dataclasses import dataclass
from enum import StrEnum

from storage.gemini_pool_models import GeminiProjectStatus

try:
    from google.genai import errors as genai_errors
except ImportError:  # pragma: no cover - google-genai is a hard dependency
    genai_errors = None  # type: ignore[assignment]


class GeminiErrorClass(StrEnum):
    RPM = "rpm"
    TPM = "tpm"
    RPD = "rpd"
    AUTH = "auth"
    INVALID_CREDENTIAL = "invalid_credential"
    MODEL_UNAVAILABLE = "model_unavailable"
    SERVER_ERROR = "server_error"
    TIMEOUT = "timeout"
    APPLICATION_ERROR = "application_error"
    UNKNOWN = "unknown"


@dataclass(frozen=True)
class ErrorClassMeta:
    #: Failing this project should exclude it from the *current* request's
    #: candidate list and let the scheduler try another project (Section
    #: 17). False only for APPLICATION_ERROR (Section 16: "A bad prompt
    #: should not cause all 60 projects to be burned through" — failing
    #: over to another project would try the exact same bad prompt again
    #: for no benefit).
    failover: bool
    #: Whether this project's own status/cooldown should change at all.
    #: False for APPLICATION_ERROR — the project did nothing wrong.
    penalizes_project: bool
    status: GeminiProjectStatus | None


ERROR_CLASS_META: dict[GeminiErrorClass, ErrorClassMeta] = {
    GeminiErrorClass.RPM: ErrorClassMeta(True, True, GeminiProjectStatus.COOLDOWN_RPM),
    GeminiErrorClass.TPM: ErrorClassMeta(True, True, GeminiProjectStatus.COOLDOWN_TPM),
    GeminiErrorClass.RPD: ErrorClassMeta(True, True, GeminiProjectStatus.DAILY_EXHAUSTED),
    GeminiErrorClass.AUTH: ErrorClassMeta(True, True, GeminiProjectStatus.AUTH_ERROR),
    GeminiErrorClass.INVALID_CREDENTIAL: ErrorClassMeta(True, True, GeminiProjectStatus.INVALID_CREDENTIAL),
    GeminiErrorClass.MODEL_UNAVAILABLE: ErrorClassMeta(True, True, GeminiProjectStatus.MODEL_UNAVAILABLE),
    GeminiErrorClass.SERVER_ERROR: ErrorClassMeta(True, True, GeminiProjectStatus.TEMPORARY_FAILURE),
    GeminiErrorClass.TIMEOUT: ErrorClassMeta(True, True, GeminiProjectStatus.TEMPORARY_FAILURE),
    GeminiErrorClass.UNKNOWN: ErrorClassMeta(True, True, GeminiProjectStatus.TEMPORARY_FAILURE),
    GeminiErrorClass.APPLICATION_ERROR: ErrorClassMeta(False, False, None),
}

_RPD_PATTERN = re.compile(r"per[_ ]?day", re.IGNORECASE)
_TPM_PATTERN = re.compile(r"token", re.IGNORECASE)
_MODEL_NOT_FOUND_PATTERN = re.compile(r"model", re.IGNORECASE)


def _classify_resource_exhausted(message: str) -> GeminiErrorClass:
    if _RPD_PATTERN.search(message):
        return GeminiErrorClass.RPD
    if _TPM_PATTERN.search(message):
        return GeminiErrorClass.TPM
    # Default to RPM: it's both the most common Gemini free/paid-tier
    # limit and the safest guess (shortest cooldown of the three quota
    # classes), so an unrecognized quota message degrades to "retry
    # soonest" rather than "wait until tomorrow."
    return GeminiErrorClass.RPM


def classify_gemini_error(exc: Exception) -> GeminiErrorClass:
    """The one place that turns an arbitrary exception from a Gemini call
    into a GeminiErrorClass. Never raises — an exception type this
    function doesn't recognize becomes UNKNOWN (still retried/failed over,
    just without a more specific status), not a crash in the classifier
    itself."""
    if isinstance(exc, TimeoutError):
        return GeminiErrorClass.TIMEOUT

    from gemini_pool.gemini_client import GeminiEmptyResponseError

    if isinstance(exc, GeminiEmptyResponseError):
        # A response with no text is almost always a safety/content block
        # on this specific prompt, not a project/credential fault —
        # Section 16's "a bad prompt should not burn through the pool."
        return GeminiErrorClass.APPLICATION_ERROR

    if genai_errors is not None and isinstance(exc, genai_errors.APIError):
        code = exc.code or 0
        status = (exc.status or "").upper()
        message = f"{exc.message or ''} {exc.details or ''}"

        if code == 429 or status == "RESOURCE_EXHAUSTED":
            return _classify_resource_exhausted(message)
        if code == 401 or status == "UNAUTHENTICATED":
            return GeminiErrorClass.AUTH
        if code == 403 or status == "PERMISSION_DENIED":
            # Gemini uses 403 both for "this key can't do this" (auth-ish)
            # and "this key/project is flat out invalid" — the message is
            # the only signal that distinguishes them.
            if re.search(r"api key not valid|invalid api key|api_key_invalid", message, re.IGNORECASE):
                return GeminiErrorClass.INVALID_CREDENTIAL
            return GeminiErrorClass.AUTH
        if code in (400, 404):
            if _MODEL_NOT_FOUND_PATTERN.search(message) and re.search(
                r"not found|not supported|unsupported|does not exist", message, re.IGNORECASE
            ):
                return GeminiErrorClass.MODEL_UNAVAILABLE
            # A malformed request/prompt/schema — the model or credential
            # is fine, the *content* of this one request is the problem.
            return GeminiErrorClass.APPLICATION_ERROR
        if isinstance(exc, genai_errors.ServerError) or 500 <= code < 600:
            return GeminiErrorClass.SERVER_ERROR
        return GeminiErrorClass.UNKNOWN

    message = str(exc).lower()
    if "timeout" in message or "timed out" in message:
        return GeminiErrorClass.TIMEOUT
    return GeminiErrorClass.UNKNOWN


_SECRET_MIN_LEN_TO_SCRUB = 12  # don't bother scrubbing trivially short test keys


def scrub_secret(text: str | None, *secrets: str | None) -> str | None:
    """Defense in depth for Section 27's "never log/expose credentials":
    strips any known secret value out of an error message before it's
    stored on the credential record (`lastError`) or logged. Gemini
    itself has no documented reason to echo an API key back in an error
    body, but this costs nothing and means a future provider that *does*
    (or a proxy/logging layer in between) can't leak one through this
    path."""
    if text is None:
        return None
    for secret in secrets:
        if secret and len(secret) >= _SECRET_MIN_LEN_TO_SCRUB and secret in text:
            text = text.replace(secret, "***REDACTED***")
    return text
