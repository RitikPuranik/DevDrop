"""
Phase 1's own tests. No real network call is made anywhere here — that's
deliberate, not a shortcut: we can't reach Gemini's API from every
environment this runs in, and these tests are about proving the app boots
and the provider abstraction is wired correctly, not about Gemini's
behavior.
"""
import pytest
from fastapi.testclient import TestClient

from config import Settings, get_settings


def test_health_unconfigured(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    get_settings.cache_clear()

    from main import app

    client = TestClient(app)
    resp = client.get("/health")

    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["provider"]["name"] == "gemini"
    assert body["provider"]["configured"] is False


def test_health_configured(monkeypatch):
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    monkeypatch.setenv("GEMINI_MODEL", "gemini-2.0-flash")
    get_settings.cache_clear()

    from main import app

    client = TestClient(app)
    resp = client.get("/health")

    assert resp.json()["provider"]["configured"] is True


def test_provider_factory_unknown_provider():
    from providers.factory import get_provider

    settings = Settings(ai_provider="not-a-real-provider")
    with pytest.raises(ValueError):
        get_provider(settings)


def test_provider_factory_gemini():
    from providers.factory import get_provider
    from providers.gemini import GeminiProvider

    settings = Settings(ai_provider="gemini", gemini_api_key="k", gemini_model="m")
    provider = get_provider(settings)

    assert isinstance(provider, GeminiProvider)
    assert provider.is_configured is True


def test_provider_factory_ollama_default_configured():
    from providers.factory import get_provider
    from providers.ollama import OllamaProvider

    settings = Settings(ai_provider="ollama")
    provider = get_provider(settings)

    assert isinstance(provider, OllamaProvider)
    # base_url/model both have defaults, so ollama is "configured" (reachable
    # in principle) even with no .env at all — unlike gemini, which needs a key.
    assert provider.is_configured is True
