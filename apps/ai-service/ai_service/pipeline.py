"""The voice pipeline (docs/09 §2): STT → clean-up → roster match → tokenise → rules → LLM for what
the rules did not catch → validate → detokenise → confidence bands.

Never guesses a student (AI-02): only a unique roster match is attached; ambiguous and unknown names
stay unattached for T07. No person name reaches the LLM (§2.4). Output is a proposal; the teacher
reviews and confirms every item.
"""

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any

from . import nlp
from .gateway import Gateway
from .llm import build_user_prompt
from .providers import DataSafetyError

IDENTITY = {"unique": "matched", "ambiguous": "ambiguous", "unknown": "unknown", "group": "group"}
# LLM confidence is not calibrated: an LLM-only item is at most "check" (OD-36 medium band).
LLM_MAX_CONFIDENCE = 0.80
_TOKEN_RE = re.compile(r"<[SAU]\d+>")


def _grounded(phrase: str, note: str) -> bool:
    """The phrase is (nearly) the teacher's own words: its normalised words appear in the note."""
    words = [w for w in nlp.normalize_for_match(phrase).split() if len(w) > 1]
    hay = nlp.normalize_for_match(note)
    return bool(words) and sum(w in hay for w in words) / len(words) >= 0.8


# "Present" must be said: حضر / حاضر / موجود / جه / جت / جا (normalised forms).
_PRESENT_RE = re.compile(r"حضر|حاضر|موجود|(?:^|\s)(?:جه|جت|جا)(?:\s|$)")
_CLAUSE_RE = re.compile(r"[.،,؛;!?\n]")
# Fields with one value per student; two different LLM values for one student cancel out.
SINGLE_VALUE_FIELDS = frozenset({"attendance", "late_minutes", "score", "participation"})


def _clause_span(token: str, tokenised: str) -> tuple[int, int]:
    """The clause (between punctuation marks) that contains the token; (0, 0) if absent."""
    at = tokenised.find(token) if token else -1
    if at < 0:
        return (0, 0)
    starts = [m.end() for m in _CLAUSE_RE.finditer(tokenised, 0, at)]
    end = _CLAUSE_RE.search(tokenised, at)
    return (starts[-1] if starts else 0, end.start() if end else len(tokenised))


def _clause_of(token: str, tokenised: str) -> str:
    s, e = _clause_span(token, tokenised)
    return tokenised[s:e]


def _source_span(it: dict[str, Any], tokenised: str) -> dict[str, int]:
    """LLM character offsets are not reliable (a real run pointed "late" at the previous clause):
    the source is the teacher's words if found as-is, else the clause around the student's name."""
    v = it.get("value")
    if it["field"] == "observation" and isinstance(v, str) and v.strip() in tokenised:
        s = tokenised.find(v.strip())
        return {"start": s, "end": s + len(v.strip())}
    s, e = _clause_span(it.get("student") or "", tokenised)
    while s < e and tokenised[s].isspace():
        s += 1
    return {"start": s, "end": e}


def ground_llm_items(items: list[dict[str, Any]], tokenised: str) -> list[dict[str, Any]]:
    """Keep only LLM items the note supports (B1 guard on top of the schema check)."""
    digits = set(re.findall(r"\d+", nlp.normalize_digits(tokenised)))
    out, seen = [], set()
    for it in items:
        key = (it["student"], it["field"])
        if key in seen:
            continue  # one value per student and field
        v = it.get("value")
        if it["field"] in ("score", "late_minutes"):
            if not isinstance(v, (int, float)) or str(int(v)) not in digits:
                continue  # a number the teacher did not say
        if it["field"] == "observation" and (not isinstance(v, str) or not _grounded(v, tokenised)):
            continue  # not the teacher's words
        if (
            it["field"] == "attendance"
            and v == "present"
            and not _PRESENT_RE.search(
                nlp.normalize_for_match(_clause_of(it["student"], tokenised))
            )
        ):
            continue  # "حلوا الواجب" is not "was here": presence must be said
        seen.add(key)
        out.append(
            {
                **it,
                "confidence": min(float(it.get("confidence", 0)), LLM_MAX_CONFIDENCE),
                "span": _source_span(it, tokenised),
            }
        )
    return out


def ground_unassigned(lines: list[str], tokenised: str) -> list[str]:
    return [
        s.strip()
        for s in lines
        if len(s.split()) >= 2  # one misheard word ("ماجاشا،") is not a class observation
        and not _TOKEN_RE.search(s)  # about a student, not the whole class
        and not re.search(r"[A-Za-z]", s)  # prompt text (e.g. "maximum 20") echoed back
        and _grounded(s, tokenised)
    ]


def drop_conflicts(
    items: list[dict[str, Any]], n_rules: int, student_of: dict[str, str | None]
) -> list[dict[str, Any]]:
    """One name said twice gets two tokens, so the same student and field can come back twice.
    `items` = rule items first (`n_rules` of them), then LLM items. Rules win; LLM-only values that
    disagree are all dropped (the teacher fills it in instead)."""
    groups: dict[tuple[str, str], list[int]] = {}
    for i, it in enumerate(items):
        sid = student_of.get(it.get("student") or "")
        if sid and it["field"] in SINGLE_VALUE_FIELDS:
            groups.setdefault((sid, it["field"]), []).append(i)
    drop: set[int] = set()
    for idx in groups.values():
        rules = [i for i in idx if i < n_rules]
        if rules:
            drop.update(i for i in idx if i != rules[0])
        elif len({repr(items[i].get("value")) for i in idx}) > 1:
            drop.update(idx)
        else:
            drop.update(idx[1:])
    return [it for i, it in enumerate(items) if i not in drop]


@dataclass
class RosterEntry:
    id: str
    display_name: str
    nicknames: list[str] = field(default_factory=list)


@dataclass
class PipelineResult:
    transcript: str
    items: list[dict[str, Any]]
    unmentioned: list[str]
    mentions: list[dict[str, Any]]
    needs_identity: bool
    model_version: str
    latency_ms: dict[str, int]
    llm_used: bool
    llm_error: str | None = None

    def prediction(self, note_id: str) -> dict[str, Any]:
        """One `<id>.pred.json` for the eval (Codex runner contract)."""
        return {
            "id": note_id,
            "model_version": self.model_version,
            "transcript": self.transcript,
            "mentions": self.mentions,
            "items": [
                {
                    "student_id": it["studentId"],
                    "field": it["field"],
                    "value": it["value"],
                    "confidence": it["confidence"],
                }
                for it in self.items
            ],
            "needs_identity": self.needs_identity,
            "latency_ms": self.latency_ms["total"],
        }


def _token_positions(tokenised: str, tokens: list[str]) -> dict[str, tuple[int, int]]:
    pos: dict[str, tuple[int, int]] = {}
    for t in tokens:
        i = tokenised.find(t)
        if i >= 0:
            pos[t] = (i, i + len(t))
    return pos


def _tok_to_clean_index(tok_text: str, token_map: dict[str, Any], i: int) -> int:
    """An index in the tokenised text → the same place in the cleaned text."""
    shift = 0
    for t, m in sorted(token_map.items(), key=lambda kv: kv[1].start):
        at = tok_text.find(t)
        if at < 0 or at >= i:
            break
        shift += (m.end - m.start) - len(t)
    return max(0, i + shift)


def run_text(
    transcript: str,
    roster: list[RosterEntry],
    assessment: dict[str, Any] | None,
    data_class: str,
    gw: Gateway,
    use_llm: bool = True,
    timings: dict[str, int] | None = None,
) -> PipelineResult:
    t0 = time.perf_counter()
    timings = dict(timings or {})
    students = [nlp.RosterStudent(r.id, r.display_name, list(r.nicknames)) for r in roster]
    cleaned = nlp.clean_transcript(transcript)
    mentions = nlp.find_name_mentions(cleaned.clean, students, threshold=0.85, margin=0.15)
    tok = nlp.tokenise(cleaned.clean, mentions)
    max_score = (assessment or {}).get("maxScore")
    rule_items = nlp.rule_extract(tok.text, max_score)
    timings["nlp"] = round((time.perf_counter() - t0) * 1000)

    llm_items: list[dict[str, Any]] = []
    unassigned: list[str] = []
    llm_error: str | None = None
    llm_used = False
    if use_llm and gw.llm is not None:
        t1 = time.perf_counter()
        tokens = list(tok.token_map.keys())
        already = [(it["student"], it["field"]) for it in rule_items]
        prompt = build_user_prompt(tok.text, tokens, assessment, already)
        # One budget for the whole LLM step, so a note always ends inside the job limit (B3).
        deadline = time.monotonic() + gw.cfg.llm_budget_s
        for _attempt in range(2):  # the schema must parse; retry once (docs/09 §2.5)
            try:
                raw = gw.extract(prompt, nlp.VOICE_EXTRACTION_SCHEMA, data_class, deadline)
                llm_items = ground_llm_items(
                    nlp.validate_extraction(raw, set(tokens), max_score), tok.text
                )
                unassigned = ground_unassigned(
                    [s for s in (raw.get("unassigned") or []) if isinstance(s, str)], tok.text
                )
                llm_used = True
                llm_error = None
                break
            except DataSafetyError:
                raise  # a refusal is never turned into a quiet "rules only" result (B2)
            except TimeoutError as e:  # out of time: rule items only, no second try
                llm_error = f"TimeoutError: {e}"[:200]
                break
            except Exception as e:  # invalid twice → rule items only (docs/09 §9)
                llm_error = f"{type(e).__name__}: {e}"[:200]
        timings["llm"] = round((time.perf_counter() - t1) * 1000)

    # Rules win: an LLM item on a (token, field) the rules already answered is dropped.
    seen = {(it["student"], it["field"]) for it in rule_items}
    merged = rule_items + [it for it in llm_items if (it["student"], it["field"]) not in seen]
    student_of = {t: m.student_id for t, m in tok.token_map.items() if m.status == "unique"}
    merged = drop_conflicts(merged, len(rule_items), student_of)
    resolved = nlp.detokenise_items(merged, tok.token_map)

    positions = _token_positions(tok.text, list(tok.token_map.keys()))
    display = cleaned.display
    items: list[dict[str, Any]] = []
    for n, r in enumerate(resolved, start=1):
        ts, te = int(r.span.get("start", 0)), int(r.span.get("end", 0))
        if not (0 <= ts < te <= len(tok.text)) and r.token in positions:
            ts, te = positions[r.token][0], min(len(tok.text), positions[r.token][1] + 40)
        cs = _tok_to_clean_index(tok.text, tok.token_map, ts)
        ce = _tok_to_clean_index(tok.text, tok.token_map, te)
        ds, de = nlp.display_span(cleaned, cs, ce)
        status = r.status if r.status in IDENTITY else "group"
        items.append(
            {
                "id": f"vi-{n}",
                "identity": IDENTITY[status],
                "studentId": r.student_id if status == "unique" else None,
                "candidates": list(r.candidates) if status == "ambiguous" else [],
                "mention": r.mention,
                "field": r.field,
                "value": r.value,
                "confidence": round(float(r.confidence), 3),
                "band": nlp.confidence_band(float(r.confidence)),
                "span": {"start": ds, "end": de},
                "sourceText": display[ds:de].strip(),
                "outOfRange": bool(r.out_of_range),
            }
        )
    # Statements about the whole session (no student) become group observations.
    for text in unassigned[:3]:
        at = display.find(text)
        items.append(
            {
                "id": f"vi-{len(items) + 1}",
                "identity": "group",
                "studentId": None,
                "candidates": [],
                "mention": None,
                "field": "observation",
                "value": text.strip(),
                "confidence": 0.7,
                "band": nlp.confidence_band(0.7),
                "span": {"start": max(at, 0), "end": max(at, 0) + (len(text) if at >= 0 else 0)},
                "sourceText": text.strip(),
                "outOfRange": False,
            }
        )

    mentioned = {it["studentId"] for it in items if it["studentId"]}
    timings["total"] = sum(v for k, v in timings.items() if k in ("stt", "nlp", "llm"))
    return PipelineResult(
        transcript=display,
        items=items,
        unmentioned=[r.id for r in roster if r.id not in mentioned],
        mentions=[
            {
                "start": m.start,
                "end": m.end,
                "text": m.text,
                "status": m.status,
                "student_id": m.student_id,
                "candidates": list(m.candidates),
            }
            for m in mentions
        ],
        needs_identity=any(it["identity"] in ("ambiguous", "unknown") for it in items),
        model_version=gw.model_version,
        latency_ms=timings,
        llm_used=llm_used,
        llm_error=llm_error,
    )


def run_audio(
    audio: bytes | str,
    roster: list[RosterEntry],
    assessment: dict[str, Any] | None,
    data_class: str,
    gw: Gateway,
    use_llm: bool = True,
) -> PipelineResult:
    t = time.perf_counter()
    hints = [r.display_name for r in roster] + [n for r in roster for n in r.nicknames]
    stt = gw.transcribe(audio, data_class, hints)
    return run_text(
        stt.text,
        roster,
        assessment,
        data_class,
        gw,
        use_llm,
        timings={"stt": round((time.perf_counter() - t) * 1000)},
    )
