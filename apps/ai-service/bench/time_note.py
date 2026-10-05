"""Time one note through the whole pipeline (speech-to-text + rules + optional LLM), cold and warm.

    uv run python bench/time_note.py --audio bench/audio/b-long-60s.wav --stt-device cpu \
        [--llm qwen3:4b --llm-device cpu | --no-llm] [--runs 2]

Prints one JSON line per run: seconds per stage, whether the LLM answered, the audio length.
Synthetic audio only (the bench roster). The first run includes loading the models.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import wave
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_service.config import load_config  # noqa: E402
from ai_service.gateway import Gateway  # noqa: E402
from ai_service.pipeline import RosterEntry, run_audio  # noqa: E402
from ai_service.stt import WhisperStt  # noqa: E402

HERE = Path(__file__).parent


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", default=str(HERE / "audio" / "b-long-60s.wav"))
    ap.add_argument("--stt-model", default="large-v3-turbo")
    ap.add_argument("--stt-device", default="cpu")
    ap.add_argument("--llm")
    ap.add_argument("--llm-device", default="auto")
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--runs", type=int, default=2)
    a = ap.parse_args()

    cfg = load_config()
    roster = [
        RosterEntry(f"s{i}", n)
        for i, n in enumerate(json.loads((HERE / "sentences.json").read_text("utf-8"))["roster"], 1)
    ]
    with wave.open(a.audio) as w:
        audio_s = round(w.getnframes() / w.getframerate(), 1)
    llm = None
    if not a.no_llm:
        from ai_service.llm import OllamaLlm

        llm = OllamaLlm(cfg.ollama_url, a.llm or cfg.routing.llm_model, device=a.llm_device)
    t = time.perf_counter()
    stt = WhisperStt(a.stt_model, cfg.models_dir, a.stt_device, "auto")
    stt.load()
    load_s = round(time.perf_counter() - t, 1)
    gw = Gateway(cfg, stt, llm)
    for run in range(1, a.runs + 1):
        t = time.perf_counter()
        res = run_audio(a.audio, roster, {"title": "كويز", "maxScore": 20}, "synthetic", gw,
                        use_llm=llm is not None)  # fmt: skip
        total = round(time.perf_counter() - t, 1)
        print(
            json.dumps(
                {
                    "run": run,
                    "audio_s": audio_s,
                    "model_version": res.model_version,
                    "whisper_load_s": load_s if run == 1 else 0,
                    "stt_s": round(res.latency_ms.get("stt", 0) / 1000, 1),
                    "llm_s": round(res.latency_ms.get("llm", 0) / 1000, 1),
                    "total_s": total,
                    "llm_used": res.llm_used,
                    "llm_error": res.llm_error,
                    "items": len(res.items),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
