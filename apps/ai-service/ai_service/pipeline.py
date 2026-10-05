"""The voice pipeline (docs/09 §2, docs/ai/link-nlp.md), in this order:

 1. clean_transcript            6. rule_extract (on the redacted text)
 2. find_name_mentions          7. the LLM, only for what the rules did not cover
    (the session roster only)   8. validate_extraction (all-or-nothing; one retry, then rules only)
 3. tokenise                    9. merge: rules win on attendance, late minutes and scores
 4. contact redaction           10. detokenise_items
 5. leak check: a name still    11. confidence_band (+ pilot: scores never pre-filled)
    in the text → no LLM        12. the proposal

Never guesses a student (AI-02): only `resolved` items carry a student; ambiguous and unknown names
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
from .llm import build_user_prompt, llm_schema
from .providers import DataSafetyError
from .redact import find_leaks, redact_contacts

# ResolvedItem.status → the app's VoiceItem.identity.
IDENTITY = {"resolved": "matched", "needs_identity": "ambiguous", "who_is_this": "unknown"}
# LLM confidence is not calibrated: an LLM-only item is at most "check" (OD-36 medium band).
LLM_MAX_CONFIDENCE = 0.80
# Fields the LLM may not fill at all (measured: the LLM guessed participation, precision 0.38).
RULES_ONLY_FIELDS = frozenset({"participation"})
# Fields where a rule result always wins over the LLM.
RULE_FIELDS = frozenset({"attendance", "late_minutes", "score"})
# Fields with one value per student; two different LLM values for one student cancel out.
SINGLE_VALUE_FIELDS = frozenset({"attendance", "late_minutes", "score", "participation"})
_TOKEN_RE = re.compile(r"<[SAU]\d+>")
# "Present" must be said: حضر / حاضر / موجود / جه / جت / جا (normalised forms).
_PRESENT_RE = re.compile(r"حضر|حاضر|موجود|(?:^|\s)(?:جه|جت|جا)(?:\s|$)")
_CLAUSE_RE = re.compile(r"[.،,؛;!?\n]")


def _grounded(phrase: str, note: str) -> bool:
    """The phrase is (nearly) the teacher's own words: its normalised words appear in the note."""
    words = [w for w in nlp.normalize_for_match(phrase).split() if len(w) > 1]
    hay = nlp.normalize_for_match(note)
    return bool(words) and sum(w in hay for w in words) / len(words) >= 0.8


def _clause_span(token: str, text: str) -> tuple[int, int]:
    """The clause (between punctuation marks) that contains the token; (0, 0) if absent."""
    at = text.find(token) if token else -1
    if at < 0:
        return (0, 0)
    starts = [m.end() for m in _CLAUSE_RE.finditer(text, 0, at)]
    end = _CLAUSE_RE.search(text, at)
    s, e = (starts[-1] if starts else 0), (end.start() if end else len(text))
    while s < e and text[s].isspace():
        s += 1
    return (s, e)


def _source_span(it: dict[str, Any], text: str) -> dict[str, int]:
    """LLM character offsets are not reliable (a real run pointed "late" at the previous clause):
    the source is the teacher's words if found as-is, else the clause around the student's name."""
    v = it.get("value")
    if it["field"] == "observation" and isinstance(v, str) and v.strip() and v.strip() in text:
        s = text.find(v.strip())
        return {"start": s, "end": s + len(v.strip())}
    s, e = _clause_span(it.get("student") or "", text)
    return {"start": s, "end": max(e, s + 1)}


def with_spans(raw: Any, text: str) -> Any:
    """The model writes no spans (llm_schema); each item gets the locally computed source span so
    the reply can be checked against the full wire schema. Anything malformed is left as it is for
    validate_extraction to reject."""
    if not isinstance(raw, dict) or not isinstance(raw.get("items"), list):
        return raw
    items = [
        {**it, "span": _source_span(it, text)}
        if isinstance(it, dict) and isinstance(it.get("field"), str)
        else it
        for it in raw["items"]
    ]
    return {**raw, "items": items}


def ground_llm_items(items: list[dict[str, Any]], text: str) -> list[dict[str, Any]]:
    """Keep only validated LLM items the note supports (on top of validate_extraction)."""
    # clean_transcript writes scores as "N/M" and durations as "N min": an LLM number must appear in
    # that form (a "10" from "10 min" is not a score of 10).
    plain = nlp.normalize_digits(text)
    said = {
        "score": set(re.findall(r"(\d+(?:\.\d+)?)/\d", plain)),
        "late_minutes": set(re.findall(r"(\d+) min", plain)),
    }
    out, seen = [], set()
    for it in items:
        key = (it["student"], it["field"])
        if key in seen:
            continue  # one value per token and field
        v = it.get("value")
        if v is None:
            continue  # "not said" carries nothing to review
        if it["student"].startswith("<U"):
            continue  # unknown spans are not LLM targets (see run_text)
        if it["field"] in RULES_ONLY_FIELDS:
            continue  # owned by link_nlp's explicit-phrase rules (see llm._VALUES)
        if it["field"] in said:
            if not isinstance(v, (int, float)) or f"{v:g}" not in said[it["field"]]:
                continue  # a number the teacher did not say (as a score / as minutes)
        if it["field"] == "observation" and (not isinstance(v, str) or not _grounded(v, text)):
            continue  # not the teacher's words
        clause = nlp.normalize_for_match(text[slice(*_clause_span(it["student"], text))])
        if it["field"] == "attendance" and v == "present" and not _PRESENT_RE.search(clause):
            continue  # "حلوا الواجب" is not "was here": presence must be said
        seen.add(key)
        out.append(
            {
                **it,
                "confidence": min(float(it.get("confidence", 0)), LLM_MAX_CONFIDENCE),
                "span": _source_span(it, text),
            }
        )
    return out


def ground_unassigned(lines: list[str], text: str) -> list[str]:
    return [
        s.strip()
        for s in lines
        if len(s.split()) >= 2  # one misheard word ("ماجاشا،") is not a class observation
        and not _TOKEN_RE.search(s)  # about a student, not the whole class
        and "#" not in s  # redacted contact data
        and not re.search(r"[A-Za-z]", s)  # prompt text (e.g. "maximum 20") echoed back
        and _grounded(s, text)
    ]


def merge(
    rule_items: list[dict[str, Any]],
    llm_items: list[dict[str, Any]],
    student_of: dict[str, str],
) -> list[dict[str, Any]]:
    """Rules win on attendance, late minutes and scores for the same student (one name said twice
    gets two tokens, so this is by student, not by token). Two LLM values that disagree for one
    student and field cancel out (the teacher fills it in). Items keep their order: rules first."""

    def who(it: dict[str, Any]) -> str:
        return student_of.get(it["student"], it["student"])

    ruled = {(who(it), it["field"]) for it in rule_items}
    llm: list[dict[str, Any]] = []
    for it in llm_items:
        if it["field"] in RULE_FIELDS and (who(it), it["field"]) in ruled:
            continue
        llm.append(it)
    groups: dict[tuple[str, str], list[int]] = {}
    for i, it in enumerate(llm):
        if it["field"] in SINGLE_VALUE_FIELDS:
            groups.setdefault((who(it), it["field"]), []).append(i)
    drop: set[int] = set()
    for idx in groups.values():
        if len({repr(llm[i].get("value")) for i in idx}) > 1:
            drop.update(idx)
        else:
            drop.update(idx[1:])
    return rule_items + [it for i, it in enumerate(llm) if i not in drop]


MATCH_MARGIN = 0.15  # the matcher's margin (find_name_mentions below)


def contenders(candidates: tuple[tuple[str, float], ...]) -> list[str]:
    """The students T07 offers for an ambiguous name: those within the matcher's own margin of the
    best score. link_nlp returns the whole roster, scored; "مريم" at 0.25 is not a contender for
    "أحمد" (0.92, 0.92)."""
    if not candidates:
        return []
    top = max(score for _sid, score in candidates)
    return [sid for sid, score in candidates if score > 0 and score >= top - MATCH_MARGIN]


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
    unresolved: list[dict[str, Any]]
    model_version: str
    latency_ms: dict[str, int]
    llm_used: bool
    llm_error: str | None = None
    leak_blocked: bool = False
    contacts_redacted: int = 0

    @property
    def needs_identity(self) -> bool:
        return bool(self.unresolved)

    def prediction(self, note_id: str) -> dict[str, Any]:
        """One `<id>.pred.json` for link_eval (docs/ai/link-nlp.md, "Integration notes")."""
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
                    "out_of_range": it["outOfRange"],
                }
                for it in self.items
                if it["identity"] == "matched"
            ],
            "needs_identity": self.unresolved,
            "latency_ms": self.latency_ms["total"],
        }


def _display_span(
    cleaned: nlp.CleanedTranscript, tok: nlp.Tokenised, span: dict[str, Any]
) -> tuple[int, int]:
    """A span in the tokenised text → the display transcript (tokens and number clean-up undone)."""
    try:
        cs, ce = tok.clean_span(int(span["start"]), int(span["end"]))
        return cleaned.display_span(cs, ce)
    except (KeyError, TypeError, ValueError):
        return (0, 0)


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
    students = [nlp.RosterStudent(r.id, r.display_name, tuple(r.nicknames)) for r in roster]
    # 1–3: clean-up, the session roster only, tokens.
    cleaned = nlp.clean_transcript(transcript)
    mentions = nlp.find_name_mentions(cleaned.clean, students, threshold=0.85, margin=MATCH_MARGIN)
    tok = nlp.tokenise(cleaned.clean, mentions)
    sent_tokens = set(tok.token_map)
    max_score = (assessment or {}).get("maxScore")
    # 4: contacts out (length-preserving, so every offset stays valid). 5: the leak check.
    text, contacts = redact_contacts(tok.text)
    leaks = find_leaks(text, students, mentions)
    # 6: rules, validated like any other extractor output.
    rules = nlp.validate_extraction(
        {"items": nlp.rule_extract(text, max_score)}, sent_tokens, max_score
    )
    if not rules.valid:  # a link_nlp contract break, not a teacher's problem: no rule items
        rule_items: list[dict[str, Any]] = []
        rule_oor: set[int] = set()
    else:
        rule_items, rule_oor = rules.items, set(rules.out_of_range)
    for i, it in enumerate(rule_items):
        it["_out_of_range"] = i in rule_oor
    timings["nlp"] = round((time.perf_counter() - t0) * 1000)

    # 7–8: the LLM for what the rules did not cover; all-or-nothing validation, one retry.
    llm_items: list[dict[str, Any]] = []
    unassigned: list[str] = []
    llm_error: str | None = None
    llm_used = False
    leak_blocked = False
    if use_llm and gw.llm is not None and leaks:
        leak_blocked = True
        llm_error = "leak_check: a name was still in the text; LLM skipped"
        gw.log_event(task="leak_check", data_class=data_class, leaks=leaks, ok=False)
    elif use_llm and gw.llm is not None:
        t1 = time.perf_counter()
        already = [(it["student"], it["field"]) for it in rule_items]
        # Not <U#>: an unknown span is often not a person ("على كشف"), and an LLM item on it can only
        # become a blocking "Who is this?" for the teacher. Rule items on <U#> still go through.
        llm_tokens = sorted(t for t in sent_tokens if not t.startswith("<U"))
        prompt = build_user_prompt(text, llm_tokens, assessment, already)
        deadline = time.monotonic() + gw.cfg.llm_budget_s  # one budget for the step (B3)
        for _attempt in range(2):
            try:
                raw = gw.extract(prompt, llm_schema(llm_tokens), data_class, deadline)
                vr = nlp.validate_extraction(with_spans(raw, text), sent_tokens, max_score)
                if not vr.valid:
                    raise ValueError("; ".join(vr.errors[:3]))
                oor = set(vr.out_of_range)
                for i, it in enumerate(vr.items):
                    it["_out_of_range"] = i in oor
                llm_items = ground_llm_items(vr.items, text)
                unassigned = ground_unassigned(list(vr.unassigned), text)
                llm_used, llm_error = True, None
                break
            except DataSafetyError:
                raise  # a refusal is never turned into a quiet "rules only" result (B2)
            except TimeoutError as e:  # out of time: rule items only, no second try
                llm_error = f"TimeoutError: {e}"[:200]
                break
            except Exception as e:  # invalid twice → rule items only (docs/09 §9)
                llm_error = f"{type(e).__name__}: {e}"[:200]
        timings["llm"] = round((time.perf_counter() - t1) * 1000)

    # 9–10: merge (rules win), then local identities.
    student_of = {
        t: m.student_id for t, m in tok.token_map.items() if m.student_id and t.startswith("<S")
    }
    merged = merge(rule_items, llm_items, student_of)
    resolved = nlp.detokenise_items(merged, tok.token_map)

    # 11–12: bands and the proposal.
    display = cleaned.display
    items: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for r in resolved:
        if r.status == "rejected":
            continue  # an invented or inconsistent token is never shown or saved
        it = r.item
        conf = float(it.get("confidence", 0))
        band = nlp.UI_BAND[nlp.confidence_band(conf)]
        if it["field"] == "score" and not gw.cfg.score_prefill and band == "high":
            band = "medium"  # pilot: a voice score is always checked by the teacher
        ds, de = _display_span(cleaned, tok, it.get("span") or {})
        candidates = contenders(r.candidates) if r.status == "needs_identity" else []
        out = {
            "id": f"vi-{len(items) + 1}",
            "identity": IDENTITY[r.status],
            "studentId": r.student_id if r.status == "resolved" else None,
            "candidates": candidates,
            "mention": r.mention.text if r.mention else None,
            "field": it["field"],
            "value": it.get("value"),
            "confidence": round(conf, 3),
            "band": band,
            "span": {"start": ds, "end": de},
            "sourceText": display[ds:de].strip(),
            "outOfRange": bool(it.get("_out_of_range")),
        }
        items.append(out)
        if r.status != "resolved":
            unresolved.append(
                {
                    "student_id": None,
                    "field": out["field"],
                    "value": out["value"],
                    "confidence": out["confidence"],
                    "status": r.status,
                    "candidates": candidates,
                    "text": out["mention"],
                }
            )
    # Statements about the whole session (no student) become group observations.
    for line in unassigned[:3]:
        at = display.find(line)
        items.append(
            {
                "id": f"vi-{len(items) + 1}",
                "identity": "group",
                "studentId": None,
                "candidates": [],
                "mention": None,
                "field": "observation",
                "value": line,
                "confidence": 0.7,
                "band": nlp.UI_BAND[nlp.confidence_band(0.7)],
                "span": {"start": max(at, 0), "end": max(at, 0) + (len(line) if at >= 0 else 0)},
                "sourceText": line,
                "outOfRange": False,
            }
        )

    mentioned = {it["studentId"] for it in items if it["studentId"]}
    timings["total"] = sum(v for k, v in timings.items() if k in ("stt", "nlp", "llm"))
    pred_mentions = []
    for m in mentions:
        ms, me = cleaned.display_span(m.start, m.end)
        pred_mentions.append(
            {
                "start": ms,
                "end": me,
                "text": display[ms:me],
                "status": m.status,
                "student_id": m.student_id,
                "candidates": [list(c) for c in m.candidates],
            }
        )
    return PipelineResult(
        transcript=display,
        items=items,
        unmentioned=[r.id for r in roster if r.id not in mentioned],
        mentions=pred_mentions,
        unresolved=unresolved,
        model_version=gw.model_version,
        latency_ms=timings,
        llm_used=llm_used,
        llm_error=llm_error,
        leak_blocked=leak_blocked,
        contacts_redacted=contacts,
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
