from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ai_service.config import Config  # noqa: E402
from ai_service.gateway import Gateway  # noqa: E402
from ai_service.pipeline import RosterEntry  # noqa: E402


@dataclass
class FakeStt:
    text: str = ""
    provider: str = "fake-stt"
    calls: list[Any] = field(default_factory=list)

    @property
    def version(self) -> str:
        return "fake-stt@1"

    def transcribe(self, audio: Any, hints: list[str] | None = None) -> Any:
        self.calls.append((audio, hints))
        return type(
            "R", (), {"text": self.text, "language": "ar", "duration_s": 12.0, "segments": []}
        )()


@dataclass
class FakeLlm:
    reply: Any = None
    provider: str = "fake-llm"
    prompts: list[str] = field(default_factory=list)

    @property
    def version(self) -> str:
        return "fake-llm@1+extract-v1"

    def extract(
        self, user_prompt: str, schema: dict[str, Any], timeout_s: float | None = None
    ) -> Any:
        self.prompts.append(user_prompt)
        r = self.reply(user_prompt) if callable(self.reply) else self.reply
        if isinstance(r, Exception):
            raise r
        return r if r is not None else {"items": []}


ROSTER = [
    RosterEntry("stu-mariam", "مريم"),
    RosterEntry("stu-ahmed-s", "أحمد س."),
    RosterEntry("stu-ahmed-m", "أحمد م."),
    RosterEntry("stu-youssef", "يوسف"),
    RosterEntry("stu-laila", "ليلى"),
]


@pytest.fixture
def cfg(tmp_path: Path) -> Config:
    return Config(token="t", usage_log=tmp_path / "usage.jsonl")


@pytest.fixture
def make_gw(cfg: Config):
    def make(stt: FakeStt | None = None, llm: FakeLlm | None = None) -> Gateway:
        return Gateway(cfg, stt or FakeStt(), llm)

    return make
