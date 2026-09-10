from google.genai import errors as genai_errors

from gemini_pool.errors import GeminiErrorClass, classify_gemini_error, scrub_secret
from gemini_pool.gemini_client import GeminiEmptyResponseError


def _client_error(code: int, status: str, message: str) -> genai_errors.APIError:
    return genai_errors.ClientError(code, {"error": {"code": code, "status": status, "message": message}})


def _server_error(code: int, status: str, message: str) -> genai_errors.APIError:
    return genai_errors.ServerError(code, {"error": {"code": code, "status": status, "message": message}})


def test_rpm_quota_message_classifies_as_rpm():
    exc = _client_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded for GenerateRequestsPerMinutePerProjectPerModel")
    assert classify_gemini_error(exc) == GeminiErrorClass.RPM


def test_tpm_quota_message_classifies_as_tpm():
    exc = _client_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded for GenerateContentInputTokensPerModelPerMinute")
    assert classify_gemini_error(exc) == GeminiErrorClass.TPM


def test_daily_quota_message_classifies_as_rpd():
    exc = _client_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded for GenerateRequestsPerDayPerProjectPerModel")
    assert classify_gemini_error(exc) == GeminiErrorClass.RPD


def test_unrecognized_quota_message_defaults_to_rpm_not_a_crash():
    exc = _client_error(429, "RESOURCE_EXHAUSTED", "Quota exceeded for SomeFutureLimitGoogleHasntInventedYet")
    assert classify_gemini_error(exc) == GeminiErrorClass.RPM


def test_401_classifies_as_auth():
    exc = _client_error(401, "UNAUTHENTICATED", "Request had invalid authentication credentials.")
    assert classify_gemini_error(exc) == GeminiErrorClass.AUTH


def test_403_with_invalid_key_message_classifies_as_invalid_credential():
    exc = _client_error(403, "PERMISSION_DENIED", "API key not valid. Please pass a valid API key.")
    assert classify_gemini_error(exc) == GeminiErrorClass.INVALID_CREDENTIAL


def test_403_without_invalid_key_message_classifies_as_auth():
    exc = _client_error(403, "PERMISSION_DENIED", "The caller does not have permission to access this resource.")
    assert classify_gemini_error(exc) == GeminiErrorClass.AUTH


def test_model_not_found_classifies_as_model_unavailable():
    exc = _client_error(404, "NOT_FOUND", "Model 'gemini-9000' not found or not supported.")
    assert classify_gemini_error(exc) == GeminiErrorClass.MODEL_UNAVAILABLE


def test_malformed_request_classifies_as_application_error():
    exc = _client_error(400, "INVALID_ARGUMENT", "Request contains an invalid argument in the prompt content.")
    assert classify_gemini_error(exc) == GeminiErrorClass.APPLICATION_ERROR


def test_server_error_classifies_as_server_error():
    exc = _server_error(500, "INTERNAL", "An internal error occurred.")
    assert classify_gemini_error(exc) == GeminiErrorClass.SERVER_ERROR


def test_builtin_timeout_error_classifies_as_timeout():
    assert classify_gemini_error(TimeoutError("deadline exceeded")) == GeminiErrorClass.TIMEOUT


def test_empty_response_classifies_as_application_error_not_a_project_fault():
    assert classify_gemini_error(GeminiEmptyResponseError("empty")) == GeminiErrorClass.APPLICATION_ERROR


def test_unrecognized_exception_classifies_as_unknown_not_a_crash():
    assert classify_gemini_error(RuntimeError("something weird")) == GeminiErrorClass.UNKNOWN


def test_generic_exception_with_timeout_wording_classifies_as_timeout():
    assert classify_gemini_error(OSError("connection timed out")) == GeminiErrorClass.TIMEOUT


def test_scrub_secret_redacts_known_credential_from_error_text():
    secret = "AIzaSyD-1234567890EXAMPLEKEYVALUE"
    text = f"Request failed with key {secret} rejected"
    scrubbed = scrub_secret(text, secret)
    assert secret not in scrubbed
    assert "REDACTED" in scrubbed


def test_scrub_secret_ignores_short_values_and_none():
    assert scrub_secret("no secret here", "short") == "no secret here"
    assert scrub_secret(None, "whatever") is None
    assert scrub_secret("text", None) == "text"
