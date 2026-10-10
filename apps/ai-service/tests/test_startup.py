"""Ship job S1: what stops ai-service from starting (app.startup_problems)."""

from ai_service.app import startup_problems
from ai_service.config import load_config

TOKEN = "t" * 32


def cfg(**env: str):
    return load_config({"AI_SERVICE_TOKEN": TOKEN, **env})


def test_this_machine_only_by_default() -> None:
    assert startup_problems(cfg(), {}) == []
    p = startup_problems(cfg(AI_SERVICE_HOST="0.0.0.0"), {})
    assert p and "this machine only" in p[0]


def test_a_container_on_one_server_needs_the_switch_and_a_long_token() -> None:
    assert startup_problems(cfg(AI_SERVICE_HOST="0.0.0.0"), {"AI_ALLOW_PRIVATE_NETWORK": "1"}) == []
    short = load_config({"AI_SERVICE_TOKEN": "short", "AI_SERVICE_HOST": "0.0.0.0"})
    p = startup_problems(short, {"AI_ALLOW_PRIVATE_NETWORK": "1"})
    assert p and "24 characters" in p[0]


def test_production_refuses_fakes_and_demo_prefill() -> None:
    routing = '{"stt": {"provider": "fake-stt"}, "llm": {"provider": "fake-llm"}}'
    c = cfg(MODEL_ROUTING_CONFIG=routing, AI_SCORE_PREFILL="1")
    p = startup_problems(c, {"LINK_ENV": "production"})
    assert any("fake STT or LLM" in x for x in p)
    assert any("AI_SCORE_PREFILL" in x for x in p)
    # Staging (pnpm prod:local) allows them.
    assert startup_problems(c, {"LINK_ENV": "staging"}) == []
