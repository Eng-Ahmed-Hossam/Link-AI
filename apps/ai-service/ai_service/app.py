"""ai-service HTTP API (local only: 127.0.0.1, shared token).

    POST /v1/jobs          audio + meta → 202; result POSTed to meta.callbackUrl when done
    GET  /v1/jobs/{id}     status
    POST /v1/transcribe    audio → text (Ask Link questions; nothing else)
    POST /v1/extract-text  transcript → proposal (eval text-only path, tests)
    GET  /health, /ready

ai-service writes nothing itself: results go back to the pilot / mock server through its API.
"""

from __future__ import annotations

import json
import queue
import threading
import time
import traceback
from typing import Any

import httpx
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from pydantic import BaseModel, Field

from . import nlp
from .config import Config, load_config
from .gateway import Gateway
from .pipeline import RosterEntry, run_audio, run_text
from .providers import DataSafetyError


class RosterIn(BaseModel):
    id: str
    displayName: str
    nicknames: list[str] = Field(default_factory=list)


class JobMeta(BaseModel):
    jobId: str
    dataClass: str
    roster: list[RosterIn]
    assessment: dict[str, Any] | None = None
    callbackUrl: str
    durationS: float = 60


class TextIn(BaseModel):
    transcript: str
    dataClass: str
    roster: list[RosterIn]
    assessment: dict[str, Any] | None = None
    useLlm: bool = True


def _roster(rs: list[RosterIn]) -> list[RosterEntry]:
    return [RosterEntry(r.id, r.displayName, list(r.nicknames)) for r in rs]


class Jobs:
    """FIFO, one note at a time. Keeps a running real-time factor for the ETA shown to the teacher."""

    def __init__(self, gw: Gateway, cfg: Config):
        self.gw, self.cfg = gw, cfg
        self.q: queue.Queue[tuple[JobMeta, bytes]] = queue.Queue()
        self.status: dict[str, dict[str, Any]] = {}
        self.rtf = 0.6  # seconds of processing per second of audio (updated as notes finish)
        threading.Thread(target=self._work, daemon=True).start()

    def eta(self, duration_s: float) -> int:
        waiting = sum(1 for s in self.status.values() if s["state"] in ("queued", "processing"))
        return int(max(5, (waiting + 1) * duration_s * self.rtf + 5))

    def submit(self, meta: JobMeta, audio: bytes) -> int:
        eta = self.eta(meta.durationS)
        self.status[meta.jobId] = {"state": "queued", "etaSeconds": eta, "at": time.time()}
        self.q.put((meta, audio))
        return eta

    def _callback(self, meta: JobMeta, body: dict[str, Any]) -> None:
        for attempt in range(3):
            try:
                httpx.post(
                    meta.callbackUrl,
                    json=body,
                    timeout=15,
                    headers={"x-link-internal-token": self.cfg.token},
                ).raise_for_status()
                return
            except httpx.HTTPError:
                time.sleep(2 * (attempt + 1))

    def _work(self) -> None:
        while True:
            meta, audio = self.q.get()
            st = self.status[meta.jobId]
            st["state"] = "processing"
            t = time.perf_counter()
            try:
                res = run_audio(
                    audio, _roster(meta.roster), meta.assessment, meta.dataClass, self.gw
                )
                took = time.perf_counter() - t
                if meta.durationS > 0:
                    self.rtf = 0.7 * self.rtf + 0.3 * (took / meta.durationS)
                st.update(state="done")
                self._callback(
                    meta,
                    {
                        "jobId": meta.jobId,
                        "status": "ready",
                        "result": {
                            "transcript": res.transcript,
                            "items": res.items,
                            "unmentioned": res.unmentioned,
                            "needsIdentity": res.needs_identity,
                            "modelVersion": res.model_version,
                            "latencyMs": res.latency_ms,
                            "llmUsed": res.llm_used,
                        },
                    },
                )
            except DataSafetyError as e:
                st.update(state="refused")
                self._callback(
                    meta,
                    {"jobId": meta.jobId, "status": "failed", "code": e.code, "detail": str(e)},
                )
            except Exception as e:  # STT/decoding failure: the app offers "Type the note instead"
                traceback.print_exc()
                st.update(state="failed")
                self._callback(
                    meta,
                    {
                        "jobId": meta.jobId,
                        "status": "failed",
                        "code": "stt_failed",
                        "detail": type(e).__name__,
                    },
                )


def create_app(cfg: Config | None = None, gw: Gateway | None = None) -> FastAPI:
    cfg = cfg or load_config()
    if gw is None:
        from .llm import OllamaLlm
        from .stt import WhisperStt

        r = cfg.routing
        stt = WhisperStt(r.stt_model, cfg.models_dir, r.stt_device, r.stt_compute_type)
        gw = Gateway(cfg, stt, OllamaLlm(cfg.ollama_url, r.llm_model, device=r.llm_device))
        if cfg.preload:  # in the background, so the first note does not pay for it
            threading.Thread(target=stt.load, daemon=True).start()
    jobs = Jobs(gw, cfg)
    app = FastAPI(title="Link ai-service", version="0.1.0")

    def auth(token: str | None) -> None:
        if not cfg.token or token != cfg.token:
            raise HTTPException(401, "bad internal token")

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"ok": True}

    @app.get("/ready")
    def ready() -> dict[str, Any]:
        stt = gw.stt
        llm_ready = bool(gw.llm and getattr(gw.llm, "ready", lambda: True)())
        return {
            "stt": {"version": stt.version, "loaded": getattr(stt, "loaded", True)},
            "llm": {"version": gw.llm.version if gw.llm else None, "ready": llm_ready},
            "nlp": {"version": nlp.NLP_VERSION},
            "modelVersion": gw.model_version,
        }

    @app.post("/v1/jobs", status_code=202)
    async def submit(
        audio: UploadFile = File(...),
        meta: str = Form(...),
        x_link_internal_token: str | None = Header(default=None),
    ) -> dict[str, Any]:
        auth(x_link_internal_token)
        m = JobMeta(**json.loads(meta))
        data = await audio.read()
        if len(data) > cfg.max_audio_bytes:
            raise HTTPException(413, "audio too large")
        return {"jobId": m.jobId, "etaSeconds": jobs.submit(m, data)}

    @app.get("/v1/jobs/{job_id}")
    def job(
        job_id: str, x_link_internal_token: str | None = Header(default=None)
    ) -> dict[str, Any]:
        auth(x_link_internal_token)
        if job_id not in jobs.status:
            raise HTTPException(404, "unknown job")
        return jobs.status[job_id]

    @app.post("/v1/transcribe")
    async def transcribe(
        audio: UploadFile = File(...),
        dataClass: str = Form(...),  # noqa: N803
        x_link_internal_token: str | None = Header(default=None),
    ) -> dict[str, Any]:
        auth(x_link_internal_token)
        try:
            res = gw.transcribe(await audio.read(), dataClass)
        except DataSafetyError as e:
            raise HTTPException(422, str(e)) from e
        return {
            "text": res.text,
            "language": res.language,
            "durationS": res.duration_s,
            "modelVersion": gw.stt.version,
        }

    @app.post("/v1/extract-text")
    def extract_text(
        body: TextIn, x_link_internal_token: str | None = Header(default=None)
    ) -> dict[str, Any]:
        auth(x_link_internal_token)
        try:
            res = run_text(
                body.transcript,
                _roster(body.roster),
                body.assessment,
                body.dataClass,
                gw,
                use_llm=body.useLlm,
            )
        except DataSafetyError as e:
            raise HTTPException(422, str(e)) from e
        return {
            "transcript": res.transcript,
            "items": res.items,
            "unmentioned": res.unmentioned,
            "needsIdentity": res.needs_identity,
            "modelVersion": res.model_version,
            "latencyMs": res.latency_ms,
            "llmUsed": res.llm_used,
            "llmError": res.llm_error,
        }

    app.state.jobs = jobs
    return app


def main() -> None:
    import uvicorn

    cfg = load_config()
    if not cfg.token:
        raise SystemExit("Set AI_SERVICE_TOKEN (shared with the pilot or mock server).")
    if cfg.host not in ("127.0.0.1", "localhost"):
        raise SystemExit("ai-service listens on this machine only (AI_SERVICE_HOST=127.0.0.1).")
    uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port, log_level="warning")


if __name__ == "__main__":
    main()
