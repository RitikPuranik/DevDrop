from storage.gemini_pool_models import GeminiProjectCredential, GeminiProjectPublic, mask_secret


def _project(**overrides) -> GeminiProjectCredential:
    defaults = dict(
        name="Project A",
        projectId="proj-a",
        credentialReference="AIzaSyD-1234567890EXAMPLEKEY",
        model="gemini-2.0-flash",
    )
    return GeminiProjectCredential(**{**defaults, **overrides})


def test_mask_secret_short_value_collapses_to_fixed_mask():
    assert mask_secret("short") == "****"
    assert mask_secret("12345678") == "****"


def test_mask_secret_long_value_shows_only_a_few_chars():
    key = "AIzaSyD-1234567890EXAMPLEKEY"
    masked = mask_secret(key)
    assert masked.startswith(key[:4])
    assert masked.endswith(key[-4:])
    assert "..." in masked
    assert "1234567890" not in masked  # the middle of the key must never appear


def test_public_projection_never_includes_the_raw_credential():
    record = _project()
    public = GeminiProjectPublic.from_record(record, budget_state="normal")
    dumped = public.model_dump_json()
    assert record.credentialReference not in dumped
    assert "credentialReference" not in dumped
    assert public.maskedCredential.startswith("AIza")


def test_default_status_is_active_and_priority_has_a_sane_default():
    record = _project()
    assert record.status.value == "active"
    assert record.priority == 100
