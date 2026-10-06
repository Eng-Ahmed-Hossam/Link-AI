"""4.4 ingest the team's recordings: match gold ids by name, convert to mono 16 kHz, report
missing/extra/duplicates, keep originals, never write audio where git would track it."""

from __future__ import annotations

import json
import sys
import wave
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import ingest_recordings as ing  # noqa: E402


def _wav(path: Path, rate: int, channels: int, seconds: float = 1.0) -> None:
    n = int(rate * seconds)
    tone = (np.sin(np.linspace(0, 440 * 2 * np.pi * seconds, n)) * 8000).astype(np.int16)
    data = np.repeat(tone[:, None], channels, axis=1) if channels > 1 else tone
    with wave.open(str(path), "wb") as w:
        w.setnchannels(channels)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(data.tobytes())


def test_matches_converts_and_reports(tmp_path, monkeypatch):
    monkeypatch.setattr(ing, "git_tracks", lambda p: False)  # tmp is outside the repo
    gold = tmp_path / "gold"
    gold.mkdir()
    for i in ("syn-001", "syn-002", "syn-003"):
        (gold / f"{i}.json").write_text("{}", "utf-8")
    src = tmp_path / "phone"
    src.mkdir()
    _wav(src / "syn-001.wav", 44_100, 2, 1.5)  # stereo 44.1 kHz from a phone
    _wav(src / "syn-003.wav", 8_000, 1)
    _wav(src / "syn-003.WAV2.wav", 8_000, 1)  # not a gold id
    (src / "notes.txt").write_text("x", "utf-8")
    original = (src / "syn-001.wav").read_bytes()
    r = ing.ingest(src, gold, tmp_path / "audio", tmp_path / "meta")
    assert r["converted"] == ["syn-001", "syn-003"]
    assert r["missing"] == ["syn-002"]
    assert set(r["extra"]) == {"syn-003.WAV2.wav", "notes.txt"}
    with wave.open(str(tmp_path / "audio" / "syn-001.wav")) as w:
        assert (w.getnchannels(), w.getframerate()) == (1, 16_000)
        assert abs(w.getnframes() / 16_000 - 1.5) < 0.05
    assert (src / "syn-001.wav").read_bytes() == original  # the original is never changed
    meta = json.loads(next((tmp_path / "meta").glob("ingest-*.json")).read_text("utf-8"))
    assert meta["notes"]["syn-001"]["original"]["channels"] == 2
    assert "speaker" not in json.dumps(meta)


def test_two_takes_for_one_note_are_not_guessed(tmp_path, monkeypatch):
    monkeypatch.setattr(ing, "git_tracks", lambda p: False)
    gold = tmp_path / "gold"
    gold.mkdir()
    (gold / "syn-001.json").write_text("{}", "utf-8")
    src = tmp_path / "phone"
    src.mkdir()
    _wav(src / "syn-001.wav", 16_000, 1)
    _wav(src / "syn-001.m4a.wav", 16_000, 1)  # different stem: extra
    (src / "syn-001.m4a").write_bytes(b"another take")  # same stem, another take
    r = ing.ingest(src, gold, tmp_path / "audio", tmp_path / "meta")
    assert r["duplicates"] and r["converted"] == []


def test_refuses_to_write_audio_where_git_would_track_it(tmp_path, monkeypatch):
    monkeypatch.setattr(ing, "git_tracks", lambda p: True)
    gold = tmp_path / "gold"
    gold.mkdir()
    (gold / "syn-001.json").write_text("{}", "utf-8")
    (tmp_path / "phone").mkdir()
    with pytest.raises(SystemExit, match="git-ignored"):
        ing.ingest(tmp_path / "phone", gold, tmp_path / "audio", tmp_path / "meta")


def test_the_real_output_folders_are_git_ignored():
    assert not ing.git_tracks(ing.ROOT / "evals" / "gold" / "audio" / "syn-001.wav")
    assert not ing.git_tracks(ing.ROOT / "evals" / "gold" / "recording-metadata" / "x.json")
