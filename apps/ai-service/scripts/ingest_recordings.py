"""Take in the team's gold recordings (Part C §4.4; evals/gold/RECORDING_GUIDE.md).

    pnpm ai:ingest-recordings <folder>   [--gold evals/gold/synthetic] [--out evals/gold/audio]

- Matches audio files to the gold v1 note ids by file name (`syn-001.m4a` … `syn-035.m4a`; any
  common audio extension).
- Writes a private evaluation copy, mono 16 kHz WAV, to `evals/gold/audio/<id>.wav`. The originals
  are never changed or relabelled.
- Reports missing ids, extra files, and anything that could not be decoded.
- Writes measured duration and original format to `evals/gold/recording-metadata/ingest-<date>.json`
  (no names, no speaker details).
- Never commits audio: both output folders are git-ignored (`evals/.gitignore`); the script refuses
  to write anywhere git would track.

These are the team's own voices reading fictional scripts, so the copies stay on this laptop.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import wave
from datetime import date
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
AUDIO_EXT = {".m4a", ".wav", ".mp3", ".ogg", ".opus", ".webm", ".aac", ".flac", ".amr", ".3gp"}
ID_RE = re.compile(r"^syn-\d{3}$")
RATE = 16_000


def decode_mono_16k(path: Path) -> tuple[np.ndarray, dict[str, object]]:
    """Decode any audio file to mono 16 kHz int16 with PyAV (bundled FFmpeg)."""
    import av

    with av.open(str(path)) as container:
        stream = container.streams.audio[0]
        original = {
            "sample_rate": stream.codec_context.sample_rate,
            "channels": stream.codec_context.channels,
            "codec": stream.codec_context.name,
        }
        resampler = av.AudioResampler(format="s16", layout="mono", rate=RATE)
        chunks: list[np.ndarray] = []
        for frame in container.decode(stream):
            for out in resampler.resample(frame):
                chunks.append(out.to_ndarray().reshape(-1))
        for out in resampler.resample(None):
            chunks.append(out.to_ndarray().reshape(-1))
    samples = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.int16)
    return samples.astype(np.int16), original


def git_tracks(path: Path) -> bool:
    """True if git would track a new file at `path` (i.e. it is NOT ignored)."""
    try:
        r = subprocess.run(
            ["git", "check-ignore", "-q", str(path)], cwd=ROOT, capture_output=True, check=False
        )
        return r.returncode != 0
    except OSError:
        return True  # cannot check: refuse to write


def ingest(source: Path, gold: Path, out: Path, meta_dir: Path) -> dict[str, object]:
    ids = sorted(p.stem for p in gold.glob("*.json") if ID_RE.match(p.stem))
    if not ids:
        raise SystemExit(f"No gold notes in {gold}.")
    for target in (out / "probe.wav", meta_dir / "probe.json"):
        if git_tracks(target):
            raise SystemExit(
                f"Refusing: {target.parent} is not git-ignored. Audio never enters git."
            )
    out.mkdir(parents=True, exist_ok=True)
    meta_dir.mkdir(parents=True, exist_ok=True)
    found: dict[str, list[Path]] = {}
    extra: list[str] = []
    for f in sorted(p for p in source.iterdir() if p.is_file()):
        if f.suffix.lower() in AUDIO_EXT and f.stem in ids:
            found.setdefault(f.stem, []).append(f)
        else:
            extra.append(f.name)
    converted, failed, duplicates, notes = [], [], [], {}
    for note_id, files in sorted(found.items()):
        if len(files) > 1:
            duplicates.append([f.name for f in files])
            continue  # never guess which take is the selected one
        try:
            samples, original = decode_mono_16k(files[0])
            if samples.size == 0:
                raise ValueError("no audio")
            with wave.open(str(out / f"{note_id}.wav"), "wb") as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(RATE)
                w.writeframes(samples.tobytes())
            notes[note_id] = {
                "source_file": files[0].name,
                "duration_s": round(samples.size / RATE, 2),
                "original": original,
            }
            converted.append(note_id)
        except Exception as e:  # report and go on: one bad file must not stop the rest
            failed.append({"file": files[0].name, "error": f"{type(e).__name__}: {e}"[:200]})
    missing = [i for i in ids if i not in found]
    report = {
        "date": date.today().isoformat(),
        "gold_ids": len(ids),
        "converted": converted,
        "missing": missing,
        "extra": extra,
        "duplicates": duplicates,
        "failed": failed,
        "notes": notes,
        "output": str(out),
    }
    (meta_dir / f"ingest-{report['date']}.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), "utf-8"
    )
    return report


def main(argv: list[str] | None = None) -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    ap = argparse.ArgumentParser(prog="ai:ingest-recordings")
    ap.add_argument("folder")
    ap.add_argument("--gold", default=str(ROOT / "evals" / "gold" / "synthetic"))
    ap.add_argument("--out", default=str(ROOT / "evals" / "gold" / "audio"))
    ap.add_argument("--meta", default=str(ROOT / "evals" / "gold" / "recording-metadata"))
    a = ap.parse_args(argv)
    base = Path(os.environ.get("INIT_CWD", os.getcwd()))  # where the user ran pnpm
    source = (base / a.folder).resolve()
    if not source.is_dir():
        print(f"✖ Not a folder: {source}")
        return 2
    r = ingest(source, Path(a.gold), Path(a.out), Path(a.meta))
    print(
        f"✔ {len(r['converted'])} of {r['gold_ids']} gold notes converted to mono 16 kHz → {r['output']}"
    )  # type: ignore[arg-type]
    if r["missing"]:
        print(f"• Missing ({len(r['missing'])}): {', '.join(r['missing'])}")  # type: ignore[arg-type]
    if r["extra"]:
        print(f"• Not used (name is not a gold id): {', '.join(r['extra'])}")  # type: ignore[arg-type]
    if r["duplicates"]:
        print(f"• Two takes for one note (pick one, rename the other): {r['duplicates']}")
    if r["failed"]:
        print(f"✖ Could not decode: {r['failed']}")
    print(
        "Next: pnpm ai:eval --mode audio --models large-v3-turbo,egy-turbo-ft,large-v3 --calibrate"
    )
    return 1 if r["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
