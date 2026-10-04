"""ai-service configuration from the environment (docs/14 ai-service variables)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


@dataclass
class Routing:
    stt_provider: str = "local-whisper"
    stt_model: str = "large-v3-turbo"
    stt_device: str = "auto"  # auto | cpu | cuda
    stt_compute_type: str = "auto"  # auto | int8 | int8_float16 | float16 | float32
    llm_provider: str = "ollama"
    llm_model: str = "qwen3:8b"


@dataclass
class Config:
    host: str = "127.0.0.1"
    port: int = 8090
    token: str = ""
    models_dir: Path = ROOT / ".models"
    ollama_url: str = "http://127.0.0.1:11434"
    usage_log: Path | None = None
    routing: Routing = field(default_factory=Routing)
    # B3: a note that takes longer than this is given up ("Type the note instead"); audio kept.
    job_timeout_s: int = 180
    # The LLM step's share of it (all attempts together). On a CPU-only laptop speech-to-text takes
    # about 45 s for a 60-second note, so 90 s keeps the whole note well inside the limit.
    llm_budget_s: int = 90
    # Load the Whisper model at start (the pilot), or on the first note (the demo, when fixtures are on).
    preload: bool = True
    max_audio_bytes: int = 15_000_000


def load_config(env: dict[str, str] | None = None) -> Config:
    e = dict(os.environ if env is None else env)
    routing = Routing()
    raw = e.get("MODEL_ROUTING_CONFIG")
    if raw:
        data = json.loads(Path(raw).read_text("utf-8") if raw.strip().endswith(".json") else raw)
        stt, llm = data.get("stt", {}), data.get("llm", {})
        routing = Routing(
            stt_provider=stt.get("provider", routing.stt_provider),
            stt_model=stt.get("model", routing.stt_model),
            stt_device=stt.get("device", routing.stt_device),
            stt_compute_type=stt.get("compute_type", routing.stt_compute_type),
            llm_provider=llm.get("provider", routing.llm_provider),
            llm_model=llm.get("model", routing.llm_model),
        )
    return Config(
        host=e.get("AI_SERVICE_HOST", "127.0.0.1"),
        port=int(e.get("AI_SERVICE_PORT", "8090")),
        token=e.get("AI_SERVICE_TOKEN", ""),
        models_dir=Path(e.get("AI_MODELS_DIR", str(ROOT / ".models"))),
        ollama_url=e.get("OLLAMA_URL", "http://127.0.0.1:11434"),
        usage_log=Path(e["AI_USAGE_LOG"]) if e.get("AI_USAGE_LOG") else None,
        routing=routing,
        job_timeout_s=int(e.get("AI_JOB_TIMEOUT_S", "180")),
        llm_budget_s=int(e.get("AI_LLM_BUDGET_S", "90")),
        preload=e.get("AI_PRELOAD", "1") != "0",
    )
