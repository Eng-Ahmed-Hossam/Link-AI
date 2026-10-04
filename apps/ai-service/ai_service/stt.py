"""Local speech-to-text with faster-whisper (CTranslate2). Behind the gateway's SttProvider (docs/09 §2.2).

Models (ADR-0007): OpenAI Whisper large-v3 and large-v3-turbo (MIT), and one Egyptian/dialectal
fine-tune of large-v3-turbo (Apache-2.0). Audio never leaves the machine.
"""

from __future__ import annotations

import io
import os
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

MODELS: dict[str, dict[str, str]] = {
    "large-v3": {"repo": "Systran/faster-whisper-large-v3", "licence": "MIT (OpenAI Whisper)"},
    "large-v3-turbo": {
        "repo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
        "licence": "MIT (OpenAI Whisper)",
    },
    # Dialectal Arabic (incl. Egyptian) fine-tune of large-v3-turbo by oddadmix, CT2 conversion by
    # mohmedbj. Apache-2.0; training data private (provenance not verifiable) — ADR-0007.
    "egy-turbo-ft": {
        "repo": "mohmedbj/whisper-large-v3-turbo-arabic-dialect-ct2",
        "licence": "Apache-2.0",
    },
}


def _add_cuda_dlls() -> None:
    """Windows: make pip's CUDA 12 cuBLAS / cuDNN 9 DLLs visible to CTranslate2 (extra `gpu`)."""
    if sys.platform != "win32":
        return
    import site

    for base in site.getsitepackages():
        for sub in ("nvidia/cublas/bin", "nvidia/cudnn/bin", "nvidia/cuda_runtime/bin"):
            p = Path(base) / sub
            if p.is_dir():
                os.add_dll_directory(str(p))
                os.environ["PATH"] = f"{p}{os.pathsep}{os.environ.get('PATH', '')}"


_add_cuda_dlls()


@dataclass
class SttResult:
    text: str
    language: str
    duration_s: float
    segments: list[dict[str, Any]]


def resolve_device(device: str, compute_type: str) -> tuple[str, str]:
    import ctranslate2

    if device == "auto":
        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"
    return device, compute_type


class WhisperStt:
    """One loaded model; transcriptions run one at a time (the laptop has one CPU/GPU budget)."""

    provider = "local-whisper"

    def __init__(
        self, model: str, models_dir: Path, device: str = "auto", compute_type: str = "auto"
    ):
        self.name = model
        self.models_dir = models_dir
        self.auto_device = device == "auto"
        self.device, self.compute_type = resolve_device(device, compute_type)
        self._model: Any = None
        self._lock = threading.Lock()

    @property
    def version(self) -> str:
        return f"faster-whisper:{self.name}@{self.compute_type}/{self.device}"

    def load(self) -> None:
        if self._model is not None:
            return
        from faster_whisper import WhisperModel

        local = self.models_dir / self.name
        src = str(local) if (local / "model.bin").exists() else MODELS[self.name]["repo"]

        def build() -> Any:
            return WhisperModel(
                src,
                device=self.device,
                compute_type=self.compute_type,
                cpu_threads=os.cpu_count() or 4,
                download_root=str(self.models_dir),
            )

        try:
            model = build()
            if self.device == "cuda":
                # The CUDA libraries load on first use: warm up now, so a missing cuDNN shows here.
                import numpy as np

                list(model.transcribe(np.zeros(8000, dtype=np.float32), language="ar")[0])
        except Exception:
            if not (self.auto_device and self.device == "cuda"):
                raise
            # A GPU without the CUDA 12 / cuDNN 9 libraries (`uv sync --extra gpu`): use the CPU.
            # Device fallback only — the audio stays on this machine either way.
            self.device, self.compute_type = "cpu", "int8"
            model = build()
        self._model = model

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def transcribe(self, audio: bytes | str, hints: list[str] | None = None) -> SttResult:
        self.load()
        prompt = None
        if hints:
            # Roster names as hints (docs/09 §2.2); Whisper keeps the last ~224 prompt tokens.
            prompt = "ملاحظات المعلم بعد الحصة. أسماء الطلاب: " + "، ".join(hints[:60]) + "."
        src = io.BytesIO(audio) if isinstance(audio, bytes) else audio
        with self._lock:
            t = time.perf_counter()
            segments, info = self._model.transcribe(
                src,
                language="ar",
                task="transcribe",
                beam_size=5,
                vad_filter=True,
                initial_prompt=prompt,
                condition_on_previous_text=False,
            )
            segs = [
                {"start": s.start, "end": s.end, "text": s.text, "avg_logprob": s.avg_logprob}
                for s in segments
            ]
            _ = time.perf_counter() - t
        return SttResult(
            text=" ".join(s["text"].strip() for s in segs).strip(),
            language=info.language,
            duration_s=float(info.duration),
            segments=segs,
        )
