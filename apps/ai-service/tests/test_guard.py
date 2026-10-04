"""B2 data-safety guard (OD-51): consented_real data never leaves the device; no silent fallback."""

from __future__ import annotations

import json
from dataclasses import replace

import pytest
from conftest import ROSTER, FakeLlm, FakeStt

from ai_service.gateway import Gateway
from ai_service.pipeline import run_audio, run_text
from ai_service.providers import PROVIDERS, DataSafetyError, ProviderInfo, guard


def test_only_two_data_classes_exist():
    for bad in ("", "real", "unconsented", "test", None):
        with pytest.raises(DataSafetyError):
            guard(PROVIDERS["local-whisper"], bad)  # type: ignore[arg-type]


def test_consented_real_only_to_local_providers():
    guard(PROVIDERS["local-whisper"], "consented_real")
    guard(PROVIDERS["ollama"], "consented_real")
    with pytest.raises(DataSafetyError, match="only go to a local provider"):
        guard(PROVIDERS["groq-whisper"], "consented_real")


def test_synthetic_may_go_to_a_cloud_provider():
    guard(PROVIDERS["groq-whisper"], "synthetic")


def test_a_local_provider_that_trains_on_inputs_is_refused():
    p = ProviderInfo("local-but-trains", "llm", True, True, "this-device")
    with pytest.raises(DataSafetyError):
        guard(p, "consented_real")


def test_gateway_refuses_real_audio_to_cloud_stt_and_never_calls_it(cfg, monkeypatch):
    cloud = FakeStt(text="مريم غابت")
    cloud.provider = "groq-whisper"
    gw = Gateway(cfg, cloud, None)
    with pytest.raises(DataSafetyError):
        gw.transcribe(b"audio", "consented_real")
    assert cloud.calls == []  # nothing was sent
    # And the pipeline does not fall back to anything else: it fails.
    with pytest.raises(DataSafetyError):
        run_audio(b"audio", ROSTER, None, "consented_real", gw)
    assert cloud.calls == []


def test_gateway_refuses_real_text_to_a_cloud_llm(cfg, monkeypatch):
    llm = FakeLlm()
    monkeypatch.setitem(PROVIDERS, "cloud-llm", ProviderInfo("cloud-llm", "llm", False, True, "US"))
    llm.provider = "cloud-llm"
    gw = Gateway(cfg, FakeStt(), llm)
    with pytest.raises(DataSafetyError):
        gw.extract("NOTE: <S1> غابت", {}, "consented_real")
    assert llm.prompts == []
    # The pipeline does not swallow it into "rules only": a refusal is an error, not a fallback.
    with pytest.raises(DataSafetyError):
        run_text("مريم غابت", ROSTER, None, "consented_real", gw)


def test_usage_log_has_no_text_or_names(cfg):
    gw = Gateway(cfg, FakeStt(text="مريم غابت النهارده"), FakeLlm())
    run_audio(b"x", ROSTER, None, "synthetic", gw)
    log = cfg.usage_log.read_text("utf-8")  # type: ignore[union-attr]
    assert "مريم" not in log and "غابت" not in log
    rows = [json.loads(line) for line in log.splitlines()]
    assert {r["task"] for r in rows} == {"stt", "extract"}
    assert all(r["data_class"] == "synthetic" for r in rows)


def test_provider_declarations_are_complete():
    for p in PROVIDERS.values():
        assert isinstance(p.allows_real_data, bool)
        assert isinstance(p.trains_on_inputs, bool)
        assert p.processing_region
        assert replace(p) == p
