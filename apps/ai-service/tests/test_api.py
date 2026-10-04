"""The HTTP API: token required; a job's result (or refusal) is posted back to the caller."""

from __future__ import annotations

import json
import time

import httpx
from conftest import ROSTER, FakeLlm, FakeStt
from fastapi.testclient import TestClient

from ai_service.app import create_app
from ai_service.gateway import Gateway

META = {
    "jobId": "vn-1",
    "dataClass": "consented_real",
    "roster": [{"id": r.id, "displayName": r.display_name} for r in ROSTER],
    "assessment": None,
    "callbackUrl": "http://127.0.0.1:9/v1/internal/voice-results/vn-1",
    "durationS": 10,
}


def _client(cfg, stt, monkeypatch, posted):
    def fake_post(url, json=None, timeout=None, headers=None):  # noqa: A002
        posted.append({"url": url, "json": json, "headers": headers})
        return httpx.Response(200, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx, "post", fake_post)
    return TestClient(create_app(cfg, Gateway(cfg, stt, FakeLlm())))


def _wait(posted, n=1):
    for _ in range(100):
        if len(posted) >= n:
            return
        time.sleep(0.05)


def test_token_required(cfg, monkeypatch):
    c = _client(cfg, FakeStt("مريم غابت"), monkeypatch, [])
    r = c.post("/v1/jobs", files={"audio": ("a.webm", b"x")}, data={"meta": json.dumps(META)})
    assert r.status_code == 401


def test_job_result_is_posted_back_with_the_token(cfg, monkeypatch):
    posted: list = []
    c = _client(cfg, FakeStt("مريم غابت النهارده"), monkeypatch, posted)
    r = c.post(
        "/v1/jobs",
        files={"audio": ("a.webm", b"x")},
        data={"meta": json.dumps(META)},
        headers={"x-link-internal-token": "t"},
    )
    assert r.status_code == 202 and r.json()["etaSeconds"] > 0
    _wait(posted)
    body = posted[0]["json"]
    assert posted[0]["url"].endswith("/voice-results/vn-1")
    assert posted[0]["headers"]["x-link-internal-token"] == "t"
    assert body["status"] == "ready"
    assert body["result"]["items"][0]["studentId"] == "stu-mariam"
    assert "fake-stt@1" in body["result"]["modelVersion"]


def test_refused_data_is_reported_as_failed_not_sent(cfg, monkeypatch):
    posted: list = []
    cloud = FakeStt("مريم غابت")
    cloud.provider = "groq-whisper"
    c = _client(cfg, cloud, monkeypatch, posted)
    c.post(
        "/v1/jobs",
        files={"audio": ("a.webm", b"x")},
        data={"meta": json.dumps(META)},
        headers={"x-link-internal-token": "t"},
    )
    _wait(posted)
    assert posted[0]["json"]["status"] == "failed"
    assert posted[0]["json"]["code"] == "data_safety_refused"
    assert cloud.calls == []


def test_extract_text_and_ready(cfg, monkeypatch):
    c = _client(cfg, FakeStt(), monkeypatch, [])
    r = c.post(
        "/v1/extract-text",
        headers={"x-link-internal-token": "t"},
        json={
            "transcript": "مريم غابت",
            "dataClass": "synthetic",
            "roster": META["roster"],
            "useLlm": False,
        },
    )
    assert r.status_code == 200 and r.json()["items"][0]["field"] == "attendance"
    ready = c.get("/ready").json()
    assert ready["nlp"]["stub"] in (True, False) and "fake-stt@1" in ready["modelVersion"]
