"""Model gateway (docs/09 §5): every STT and LLM call goes through here.

- Routing from MODEL_ROUTING_CONFIG (provider + model per task).
- The data-safety guard before every call (B2). No fallback for refused data.
- One retry with back-off on transient errors; a timeout per call, within the note's LLM budget.
  A timeout is not retried: the same prompt at temperature 0 would time out again.
- A usage line per call (task, provider, model, data class, audio seconds, latency) — never text,
  names or audio.
- `model_version` = STT + NLP + LLM + prompt versions, stored on every proposal.
"""

from __future__ import annotations

import json
import sys
import time
from datetime import UTC, datetime
from typing import Any, Protocol

from .config import Config
from .nlp import NLP_VERSION
from .providers import PROVIDERS, ProviderInfo, guard


class Stt(Protocol):
    provider: str

    @property
    def version(self) -> str: ...
    def transcribe(self, audio: bytes | str, hints: list[str] | None = None) -> Any: ...


class Llm(Protocol):
    provider: str

    @property
    def version(self) -> str: ...
    def extract(
        self, user_prompt: str, schema: dict[str, Any], timeout_s: float | None = None
    ) -> Any: ...


class Gateway:
    def __init__(self, cfg: Config, stt: Stt, llm: Llm | None):
        self.cfg = cfg
        self.stt = stt
        self.llm = llm
        self.stt_info: ProviderInfo = PROVIDERS[stt.provider]
        self.llm_info: ProviderInfo | None = PROVIDERS[llm.provider] if llm else None

    @property
    def model_version(self) -> str:
        llm = self.llm.version if self.llm else "no-llm"
        return f"{self.stt.version}|{NLP_VERSION}|{llm}"

    def _log(self, **row: Any) -> None:
        row = {"at": datetime.now(UTC).isoformat(timespec="seconds"), **row}
        line = json.dumps(row, ensure_ascii=False)
        if self.cfg.usage_log:
            with self.cfg.usage_log.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
        else:
            print(line, file=sys.stderr)

    def transcribe(
        self, audio: bytes | str, data_class: str, hints: list[str] | None = None
    ) -> Any:
        guard(self.stt_info, data_class)  # raises DataSafetyError: no call, no fallback
        t = time.perf_counter()
        ok = False
        try:
            res = self.stt.transcribe(audio, hints)
            ok = True
            return res
        finally:
            dur = getattr(locals().get("res"), "duration_s", None)
            self._log(
                task="stt",
                provider=self.stt_info.name,
                model=self.stt.version,
                data_class=data_class,
                audio_s=dur,
                latency_ms=round((time.perf_counter() - t) * 1000),
                ok=ok,
            )

    def extract(
        self,
        user_prompt: str,
        schema: dict[str, Any],
        data_class: str,
        deadline: float | None = None,  # time.monotonic() by which the LLM step must end
    ) -> Any:
        if not self.llm or not self.llm_info:
            raise RuntimeError("No LLM configured.")
        guard(self.llm_info, data_class)
        t = time.perf_counter()
        last: Exception | None = None
        for attempt in range(2):
            left = None if deadline is None else deadline - time.monotonic()
            if left is not None and left < 2:
                last = TimeoutError("the note's LLM time budget is used up")
                break
            try:
                out = self.llm.extract(user_prompt, schema, timeout_s=left)
                self._log(
                    task="extract",
                    provider=self.llm_info.name,
                    model=self.llm.version,
                    data_class=data_class,
                    latency_ms=round((time.perf_counter() - t) * 1000),
                    ok=True,
                    attempt=attempt + 1,
                )
                return out
            except TimeoutError as e:
                last = e
                break
            except Exception as e:  # transient (connection, bad JSON): one retry
                last = e
                time.sleep(1.0)
        self._log(
            task="extract",
            provider=self.llm_info.name,
            model=self.llm.version,
            data_class=data_class,
            latency_ms=round((time.perf_counter() - t) * 1000),
            ok=False,
        )
        if isinstance(last, TimeoutError):
            raise last
        raise RuntimeError(f"LLM failed twice: {last}")
