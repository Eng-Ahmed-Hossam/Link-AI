"""Prediction writer for the eval (B4): one `<id>.pred.json` per note, in the eval kit's shape

    { id, model_version, transcript, mentions, items[{student_id, field, value, confidence}],
      needs_identity, latency_ms }

    uv run python -m ai_service.predict --gold <dir> --out <dir> [--mode text|audio]
        [--audio-dir <dir>] [--stt-model large-v3-turbo] [--llm qwen3:8b | --no-llm]
        [--roster <file.json>] [--data-class synthetic] [--force]

- `text` mode feeds each note's REFERENCE transcript through clean-up, name match, rules and the LLM,
  so extraction accuracy is measured separately from speech-to-text.
- `audio` mode runs the whole pipeline on `<audio-dir>/<id>.<wav|m4a|webm|mp3|ogg>`.
- Resumable: notes that already have a prediction are skipped (unless --force). Long runs can be
  stopped and started again; progress is printed per note.

Gold files are read from `<gold>/*.json` (evals/gold/synthetic: `reference_transcript`, `roster`,
`assessment.max`); a shared roster can be given with --roster. Run metadata goes to `<out>.run.json`
beside the folder (link_eval accepts only `<id>.pred.json` inside it).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any

from .config import load_config
from .gateway import Gateway
from .pipeline import RosterEntry, run_audio, run_text

AUDIO_EXT = (".wav", ".m4a", ".webm", ".mp3", ".ogg", ".flac")


class NoStt:
    """Text-only runs never call speech-to-text."""

    provider = "fake-stt"
    version = "reference-transcript"

    def transcribe(self, audio: Any, hints: Any = None) -> Any:
        raise RuntimeError("text mode does not transcribe")


def _roster(raw: Any) -> list[RosterEntry]:
    out = []
    for r in raw or []:
        if isinstance(r, str):
            out.append(RosterEntry(r, r))
        else:
            out.append(
                RosterEntry(
                    str(r.get("id") or r.get("student_id")),
                    str(r.get("display_name") or r.get("displayName") or r.get("name")),
                    list(r.get("nicknames") or []),
                )
            )
    return out


def _assessment(ref: dict[str, Any]) -> dict[str, Any] | None:
    a = ref.get("assessment")
    if isinstance(a, dict):
        mx = a.get("maxScore", a.get("max_score", a.get("max")))
        return (
            {"title": a.get("title") or a.get("name") or "", "maxScore": mx}
            if mx is not None
            else None
        )
    mx = ref.get("assessment_max")
    return {"title": "", "maxScore": mx} if mx is not None else None


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    ap = argparse.ArgumentParser(prog="ai_service.predict")
    ap.add_argument("--gold", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mode", choices=["text", "audio"], default="text")
    ap.add_argument("--audio-dir")
    ap.add_argument("--stt-model")
    ap.add_argument("--stt-device", default="auto")
    ap.add_argument("--llm")
    ap.add_argument("--no-llm", action="store_true")
    ap.add_argument("--roster")
    ap.add_argument("--data-class", default="synthetic", choices=["synthetic", "consented_real"])
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args(argv)

    cfg = load_config()
    gold = Path(a.gold)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    shared = _roster(json.loads(Path(a.roster).read_text("utf-8"))) if a.roster else None

    llm = None
    if not a.no_llm:
        from .llm import OllamaLlm

        llm = OllamaLlm(cfg.ollama_url, a.llm or cfg.routing.llm_model)
        if not llm.ready():
            print(
                f"✖ Ollama is not serving {llm.model} at {cfg.ollama_url}. "
                f"Start Ollama and `ollama pull {llm.model}`, or pass --no-llm."
            )
            return 2
    if a.mode == "audio":
        from .stt import WhisperStt

        stt: Any = WhisperStt(
            a.stt_model or cfg.routing.stt_model, cfg.models_dir, a.stt_device, "auto"
        )
        stt.load()
    else:
        stt = NoStt()
    gw = Gateway(cfg, stt, llm)

    refs = sorted(p for p in gold.glob("*.json") if not p.name.endswith(".pred.json"))
    done = skipped = failed = 0
    t_all = time.perf_counter()
    for path in refs:
        ref = json.loads(path.read_text("utf-8"))
        if not isinstance(ref, dict):
            continue
        note_id = str(ref.get("id") or path.stem)
        target = out / f"{note_id}.pred.json"
        if target.exists() and not a.force:
            skipped += 1
            continue
        roster = shared or _roster(ref.get("roster"))
        try:
            if a.mode == "text":
                transcript = (
                    ref.get("transcript") or ref.get("reference_transcript") or ref.get("text")
                )
                if not transcript:
                    raise ValueError("no reference transcript")
                res = run_text(
                    transcript, roster, _assessment(ref), a.data_class, gw, use_llm=llm is not None
                )
            else:
                audio = next(
                    (
                        Path(a.audio_dir) / f"{note_id}{e}"
                        for e in AUDIO_EXT
                        if (Path(a.audio_dir) / f"{note_id}{e}").exists()
                    ),
                    None,
                )
                if audio is None:
                    raise FileNotFoundError(f"no audio for {note_id} in {a.audio_dir}")
                res = run_audio(
                    str(audio), roster, _assessment(ref), a.data_class, gw, use_llm=llm is not None
                )
            pred = res.prediction(note_id)
            if res.llm_error:
                pred["llm_error"] = res.llm_error
            if res.leak_blocked:
                pred["leak_blocked"] = True
            target.write_text(json.dumps(pred, ensure_ascii=False, indent=2), "utf-8")
            done += 1
            print(f"✔ {note_id}: {len(pred['items'])} items, {pred['latency_ms']} ms", flush=True)
        except Exception as e:  # keep going: one bad note must not stop a long run
            failed += 1
            print(f"✖ {note_id}: {type(e).__name__}: {e}", flush=True)
    meta = {
        "model_version": gw.model_version,
        "mode": a.mode,
        "data_class": a.data_class,
        "gold": str(gold),
        "written": done,
        "skipped": skipped,
        "failed": failed,
        "seconds": round(time.perf_counter() - t_all, 1),
    }
    # Beside the folder, not in it: link_eval accepts only <id>.pred.json files there.
    out.with_name(out.name + ".run.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), "utf-8"
    )
    print(json.dumps(meta, ensure_ascii=False))
    return 1 if failed and not done else 0


if __name__ == "__main__":
    raise SystemExit(main())
