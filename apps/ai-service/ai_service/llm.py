"""Extraction LLM through a local Ollama (docs/09 §2.5). Input is the TOKENISED transcript only:
no person name reaches the model. Output is constrained to the strict JSON schema, temperature 0."""

from __future__ import annotations

import json
from typing import Any

import httpx

PROMPT_VERSION = "extract-v3"

SYSTEM = """You extract facts from an Egyptian Arabic note a teacher recorded after one class session.
Student names are replaced by tokens such as <S1>, <A1>, <U1>.
Rules:
- Only facts the teacher actually said. Nothing about students who were not mentioned.
- Leave a field out unless the teacher said it. Never output a score of 0 unless the teacher said
  zero. Never guess participation. Do not fill attendance, late_minutes or score for a student
  unless the teacher said them about that student.
- Each student and field at most once. Most notes need 1 to 5 items: stop when the facts said are
  covered.
- An observation must copy the teacher's own words from NOTE (a short exact phrase).
- Use only the tokens listed under TOKENS. Never invent a token.
- Fields: attendance (present | absent | late), late_minutes (number), score (number),
  participation (low | normal | high), observation (a short Arabic phrase in the teacher's words),
  observation_tag (understanding | needs_revisit | behaviour | positive | absence_context).
- Statements about the whole class or the next session (no token) go in "unassigned" as short Arabic
  phrases in the teacher's words.
- Do not repeat facts listed under ALREADY EXTRACTED.
- confidence: how sure you are the teacher said exactly this (0 to 1).
- span: character offsets (start, end) in NOTE of the words the item came from.
Return only JSON matching the schema."""


def build_user_prompt(
    tokenised_text: str,
    tokens: list[str],
    assessment: dict[str, Any] | None,
    already: list[tuple[str, str]],
) -> str:
    done = "\n".join(f"- {t} {f}" for t, f in already) or "- (none)"
    a = (
        f"{assessment.get('title') or 'assessment'}, maximum {assessment['maxScore']}"
        if assessment and assessment.get("maxScore") is not None
        else "none"
    )
    return (
        f"NOTE:\n{tokenised_text}\n\nTOKENS: {', '.join(tokens) or '(none)'}\n"
        f"ASSESSMENT: {a}\n\nALREADY EXTRACTED:\n{done}\n"
    )


class OllamaLlm:
    provider = "ollama"

    def __init__(self, url: str, model: str, timeout_s: float = 60):
        self.url = url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s

    @property
    def version(self) -> str:
        return f"ollama:{self.model}+{PROMPT_VERSION}"

    def ready(self) -> bool:
        try:
            r = httpx.get(f"{self.url}/api/tags", timeout=3)
            return r.status_code == 200 and any(
                m.get("name", "").startswith(self.model) for m in r.json().get("models", [])
            )
        except httpx.HTTPError:
            return False

    def extract(
        self, user_prompt: str, schema: dict[str, Any], timeout_s: float | None = None
    ) -> Any:
        body = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": user_prompt},
            ],
            "format": schema,
            "stream": False,
            "think": False,
            # Capped output: a runaway generation must not hold a note for minutes.
            "options": {"temperature": 0, "num_ctx": 4096, "num_predict": 800},
            "keep_alive": "30m",
        }
        limit = self.timeout_s if timeout_s is None else min(self.timeout_s, timeout_s)
        try:
            r = httpx.post(f"{self.url}/api/chat", json=body, timeout=limit)
        except httpx.TimeoutException as e:
            raise TimeoutError(f"no answer from {self.model} within {limit:.0f} s") from e
        r.raise_for_status()
        return json.loads(r.json()["message"]["content"])
