"""Speech-to-text benchmark on this laptop (resumable: re-run to continue; results append as they go).

    uv run python scripts/bench_stt.py [--models large-v3-turbo,egy-turbo-ft,large-v3]
                                       [--devices cpu,cuda] [--audio bench/audio] [--refs bench/sentences.json]

For every (model, device, file) it records processing time, the real-time factor and a quick
word error rate against the script text (after light Arabic normalisation). Writes
bench/out/results.jsonl and bench/out/summary.md. Bench audio is synthetic (local TTS); the real
accuracy numbers come from the gold set eval (evals/, Codex track).
"""

from __future__ import annotations

import argparse
import json
import platform
import sys
import time
import wave
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

from ai_service.config import load_config  # noqa: E402
from ai_service.nlp import normalize_for_match  # noqa: E402
from ai_service.stt import WhisperStt  # noqa: E402

OUT = ROOT / "bench" / "out"


def wer(ref: str, hyp: str) -> float:
    """Quick word error rate for the bench (the eval kit has the full metrics)."""

    def words(s: str) -> list[str]:
        return [w for w in normalize_for_match(s).replace("،", " ").replace(".", " ").split() if w]

    r, h = words(ref), words(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))


def long_note(audio_dir: Path, refs: dict[str, str], seconds: float = 60.0) -> tuple[Path, str]:
    """Join bench notes (with 0.6 s gaps) into one ~60 s note: the time target is per 60 s note."""
    path = audio_dir / "b-long-60s.wav"
    ids = sorted(refs)
    if not path.exists():
        from faster_whisper.audio import decode_audio

        parts, total = [], 0.0
        gap = np.zeros(int(16000 * 0.6), dtype=np.float32)
        while total < seconds:
            for i in ids:
                a = decode_audio(str(audio_dir / f"{i}.wav"))
                parts += [a, gap]
                total += len(a) / 16000 + 0.6
                if total >= seconds:
                    break
        pcm = (np.clip(np.concatenate(parts), -1, 1) * 32767).astype("<i2")
        with wave.open(str(path), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(16000)
            w.writeframes(pcm.tobytes())
    # Reference: the same notes in the same order (as many as fit).
    from faster_whisper.audio import decode_audio

    n, total = [], 0.0
    while total < seconds:
        for i in ids:
            total += len(decode_audio(str(audio_dir / f"{i}.wav"))) / 16000 + 0.6
            n.append(refs[i])
            if total >= seconds:
                break
    return path, " ".join(n)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="large-v3-turbo,egy-turbo-ft,large-v3")
    ap.add_argument("--devices", default="cpu,cuda")
    ap.add_argument("--audio", default=str(ROOT / "bench" / "audio"))
    ap.add_argument("--refs", default=str(ROOT / "bench" / "sentences.json"))
    a = ap.parse_args()
    cfg = load_config()
    data = json.loads(Path(a.refs).read_text("utf-8"))
    refs = {n["id"]: n["text"] for n in data["notes"]}
    roster = data["roster"]
    audio_dir = Path(a.audio)
    long_path, long_ref = long_note(audio_dir, refs)
    files = [(audio_dir / f"{i}.wav", refs[i]) for i in sorted(refs)] + [(long_path, long_ref)]

    OUT.mkdir(parents=True, exist_ok=True)
    results = OUT / "results.jsonl"
    done = set()
    if results.exists():
        for line in results.read_text("utf-8").splitlines():
            r = json.loads(line)
            done.add((r["model"], r["device"], r["file"]))

    import ctranslate2

    for model in a.models.split(","):
        for device in a.devices.split(","):
            if device == "cuda" and ctranslate2.get_cuda_device_count() == 0:
                continue
            todo = [(f, ref) for f, ref in files if (model, device, f.name) not in done]
            if not todo:
                continue
            stt = WhisperStt(model, cfg.models_dir, device, "auto")
            t = time.perf_counter()
            try:
                stt.load()
            except Exception as e:  # model missing or GPU libraries missing: record and go on
                print(f"✖ {model} on {device}: {e}", flush=True)
                continue
            load_s = time.perf_counter() - t
            for f, ref in todo:
                t = time.perf_counter()
                res = stt.transcribe(str(f), hints=roster)
                took = time.perf_counter() - t
                row = {
                    "model": model,
                    "device": device,
                    "compute_type": stt.compute_type,
                    "file": f.name,
                    "audio_s": round(res.duration_s, 2),
                    "took_s": round(took, 2),
                    "rtf": round(took / max(res.duration_s, 0.1), 3),
                    "wer": round(wer(ref, res.text), 3),
                    "load_s": round(load_s, 1),
                    "text": res.text,
                    "machine": platform.processor(),
                }
                with results.open("a", encoding="utf-8") as out:
                    out.write(json.dumps(row, ensure_ascii=False) + "\n")
                print(
                    f"{model:15} {device:4} {f.name:16} {res.duration_s:5.1f}s → {took:5.1f}s "
                    f"rtf {row['rtf']:.2f} wer {row['wer']:.2f}",
                    flush=True,
                )
            del stt
    summarize(results)


def summarize(results: Path) -> None:
    rows = [json.loads(line) for line in results.read_text("utf-8").splitlines()]
    groups: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        groups.setdefault((r["model"], r["device"]), []).append(r)
    lines = [
        "# STT benchmark (bench audio: synthetic, local TTS)",
        "",
        "| Model | Device | Compute | Short notes: mean RTF | 60 s note: time | Mean WER (short) | WER (60 s) |",
        "|---|---|---|---|---|---|---|",
    ]
    for (m, d), rs in sorted(groups.items()):
        short = [r for r in rs if not r["file"].startswith("b-long")]
        long_ = [r for r in rs if r["file"].startswith("b-long")]
        mean = lambda xs: sum(xs) / len(xs) if xs else float("nan")  # noqa: E731
        lines.append(
            f"| {m} | {d} | {rs[0]['compute_type']} | {mean([r['rtf'] for r in short]):.2f} | "
            f"{(str(long_[0]['took_s']) + ' s') if long_ else '—'} | {mean([r['wer'] for r in short]):.2f} | "
            f"{long_[0]['wer'] if long_ else '—'} |"
        )
    (OUT / "summary.md").write_text("\n".join(lines) + "\n", "utf-8")
    print("\n".join(lines))


if __name__ == "__main__":
    main()
