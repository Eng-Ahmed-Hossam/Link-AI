import { createHmac, timingSafeEqual } from 'node:crypto';
import { sql } from 'kysely';
import type { AudioStore } from '../adapters/storage';
import type { VoiceAi } from '../adapters/ai';
import type { Config } from '../config';
import { writeAudit } from '../platform/audit';
import type { Database, Tx } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import type { Logger } from '../platform/logger';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { addDays } from '../platform/time';
import { type Lang, namesOf, ref, requireExtra, sessionStudents } from './world';

/** B3: a note with no answer this long after it was handed over is given up ("Type it instead"). */
export const VOICE_TIMEOUT_MS = 180_000;
const MAX_AUDIO = 15 * 1024 * 1024;
const UPLOAD_TTL_S = 15 * 60;
/** BR-DAT-04: audio 30 days after upload; transcripts 90 days (OD-28, docs/10 §4). */
const AUDIO_DAYS = 30;
const TRANSCRIPT_DAYS = 90;

export interface StoredItem {
  id: string;
  identity: 'matched' | 'ambiguous' | 'unknown' | 'group';
  studentId: string | null;
  candidates: string[];
  suggestions?: string[];
  mention: string | null;
  field:
    'attendance' | 'late_minutes' | 'score' | 'participation' | 'observation' | 'observation_tag';
  value: string | number | null;
  confidence: number;
  band?: 'high' | 'medium' | 'low';
  span: { start: number; end: number };
  sourceText: string;
  outOfRange: boolean;
}
export interface VoiceResult {
  status: 'ready' | 'failed';
  code?: string;
  result?: {
    transcript: string;
    items: StoredItem[];
    modelVersion: string;
    latencyMs?: Record<string, number>;
  };
}

const bandOf = (c: number): 'high' | 'medium' | 'low' =>
  c >= 0.85 ? 'high' : c >= 0.6 ? 'medium' : 'low'; // OD-36

/**
 * Voice notes (FUP-VOI, docs/09): the audio goes to encrypted object storage through a signed,
 * short-lived URL; `voice.uploaded` hands it to ai-service; the proposal comes back as a DRAFT
 * (nothing becomes a record until the teacher confirms). Names are matched to the roster by
 * ai-service with the never-guess rule; core-api checks again that every student it names is on
 * this session's roster — a name it cannot place stays unmatched (FUP-VOI-04, AI-02).
 */
export class Voice {
  constructor(
    private readonly db: Database,
    private readonly store: AudioStore,
    private readonly ai: VoiceAi | null,
    private readonly c: Config,
    private readonly log: Logger,
  ) {}

  // ── signed upload URLs (docs/10 §5: signed URLs only, short expiry) ───────────
  private sign(id: string, exp: number) {
    return createHmac('sha256', Buffer.from(this.c.JWT_SIGNING_KEY, 'base64'))
      .update(`voice-upload:${id}:${exp}`)
      .digest('base64url');
  }
  uploadUrl(id: string) {
    const exp = Math.floor(Date.now() / 1000) + UPLOAD_TTL_S;
    return `/v1/voice-notes/${id}/audio?exp=${exp}&sig=${this.sign(id, exp)}`;
  }
  private verify(id: string, exp: string | undefined, sig: string | undefined) {
    const e = Number(exp);
    if (!sig || !Number.isInteger(e) || e < Date.now() / 1000)
      throw new Problem(403, 'invalid_signature', 'This upload link has expired.');
    const want = Buffer.from(this.sign(id, e));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got))
      throw new Problem(403, 'invalid_signature', 'This upload link is not valid.');
  }

  /** Data class (ADR-0007): locally every note is sample audio; real notes need the consent pack. */
  private dataClass(): 'synthetic' | 'consented_real' | null {
    return this.c.APP_ENV === 'local' ? 'synthetic' : null;
  }

  private dto(v: { id: string; session_record_id: string; status: string; duration_s: number }) {
    return {
      id: v.id,
      sessionRecordId: v.session_record_id,
      status: (v.status === 'audio_deleted' ? 'ready' : v.status) as
        'queued' | 'uploaded' | 'transcribing' | 'extracting' | 'ready' | 'failed',
      durationS: v.duration_s,
      uploadUrl: this.uploadUrl(v.id),
    };
  }

  /** The note's record and whether the caller is its group's teacher (RLS first; 404 otherwise). */
  private async noteAccess(userId: string, voiceId: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const v = await tx
        .selectFrom('records.voice_notes')
        .selectAll()
        .where('id', '=', voiceId)
        .executeTakeFirst();
      if (!v) throw notFound('voice note');
      if (v.teacher_id !== ctx.teacherId) throw forbidden('Only the teacher who recorded it.');
      return v;
    });
  }

  async create(
    userId: string,
    body: { sessionRecordId: string; durationS: number },
    key: string | undefined,
    requestId?: string,
  ) {
    const rec = await this.db.asUser(userId, async (tx, ctx) => {
      const r = await tx
        .selectFrom('records.session_records')
        .selectAll()
        .where('id', '=', body.sessionRecordId)
        .executeTakeFirst();
      if (!r) throw notFound('record');
      if (r.teacher_id !== ctx.teacherId) throw forbidden('Only the group’s teacher records.');
      return r;
    });
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, rec.centre_id);
      if (key) {
        const again = await sys
          .selectFrom('records.voice_notes')
          .selectAll()
          .where('idempotency_key', '=', key)
          .executeTakeFirst();
        if (again && again.created_by === userId) return this.dto(again);
      }
      const dataClass = this.dataClass();
      // Outside a local machine there is no consented voice yet (OD-51): type the note instead.
      if (!dataClass)
        throw new Problem(503, 'stt_unavailable', 'Voice notes are not available yet.');
      if (rec.status === 'confirmed')
        throw new Problem(409, 'record_confirmed', 'This record is confirmed.');
      const id = uuidv7();
      const row = {
        id,
        session_record_id: rec.id,
        centre_id: rec.centre_id,
        teacher_id: rec.teacher_id,
        created_by: userId,
        idempotency_key: key ?? null,
        duration_s: Math.min(900, Math.max(1, Math.round(body.durationS || 0))),
        data_class: dataClass,
      };
      await sys.insertInto('records.voice_notes').values(row).execute();
      await sys
        .insertInto('records.voice_extractions')
        .values({ id: uuidv7(), voice_note_id: id, centre_id: rec.centre_id, status: 'proposed' })
        .execute();
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: rec.centre_id,
        action: 'voice.created',
        objectType: 'voice_note',
        objectRef: id,
        after: { recordId: rec.id, durationS: row.duration_s, dataClass },
        requestId,
      });
      return this.dto({ ...row, status: 'queued' });
    });
  }

  /** The signed upload: bytes into encrypted storage, never on core-api's disk. */
  async putAudio(
    id: string,
    exp: string | undefined,
    sig: string | undefined,
    bytes: Buffer,
    mime: string,
  ) {
    this.verify(id, exp, sig);
    if (!bytes?.length || bytes.length > MAX_AUDIO)
      throw new Problem(413, 'bad_audio', 'The recording is empty or larger than 15 MB.');
    const v = await this.db.asSystem((sys) =>
      sys.selectFrom('records.voice_notes').selectAll().where('id', '=', id).executeTakeFirst(),
    );
    if (!v) throw notFound('voice note');
    if (v.status !== 'queued' && v.status !== 'uploaded')
      throw new Problem(409, 'already_uploaded', 'This note was already handed over.');
    const key = `voice/${v.centre_id}/${v.id}`;
    const type = /^audio\/[\w.+-]+$/.test(mime) ? mime : 'application/octet-stream';
    await this.store.put(key, new Uint8Array(bytes), type);
    const now = new Date();
    return this.db.asSystem(async (sys) => {
      const done = await sys
        .updateTable('records.voice_notes')
        .set({
          audio_key: key,
          audio_mime: type,
          audio_bytes: bytes.length,
          uploaded_at: now,
          delete_after: new Date(now.getTime() + AUDIO_DAYS * 86_400_000),
          transcript_delete_after: new Date(now.getTime() + TRANSCRIPT_DAYS * 86_400_000),
          status: 'uploaded',
        })
        .where('id', '=', id)
        .where('status', 'in', ['queued', 'uploaded'])
        .returningAll()
        .executeTakeFirstOrThrow();
      return this.dto(done);
    });
  }

  /** The app says the upload finished: `voice.uploaded` → ai-service (the `voice` consumer). */
  async uploaded(userId: string, id: string, requestId?: string) {
    const v = await this.noteAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, v.centre_id);
      const row = await sys
        .selectFrom('records.voice_notes')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (row.status === 'queued')
        throw new Problem(409, 'not_uploaded', 'Upload the recording first.');
      if (row.status !== 'uploaded') return this.dto(row);
      const done = await this.handOver(sys, row.id, row.centre_id, requestId);
      await writeAudit(sys, {
        actorId: userId,
        actorType: 'user',
        centreId: v.centre_id,
        action: 'voice.uploaded',
        objectType: 'voice_note',
        objectRef: id,
        after: { recordId: v.session_record_id, durationS: v.duration_s, bytes: row.audio_bytes },
        requestId,
      });
      return this.dto(done);
    });
  }

  private async handOver(sys: Tx, id: string, centreId: string, requestId?: string) {
    const done = await sys
      .updateTable('records.voice_notes')
      .set({ status: 'transcribing', submitted_at: new Date(), failure_code: null })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
    await enqueue(sys, {
      type: 'voice.uploaded',
      aggregateType: 'voice_note',
      aggregateId: id,
      centreId,
      data: { voiceNoteId: id },
      requestId,
    });
    return done;
  }

  /** B3 "Try again": the kept audio goes to speech-to-text again. */
  async retry(userId: string, id: string, requestId?: string) {
    const v = await this.noteAccess(userId, id);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, v.centre_id);
      const row = await sys
        .selectFrom('records.voice_notes')
        .selectAll()
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (row.status === 'queued')
        throw new Problem(409, 'not_uploaded', 'Upload the recording first.');
      if (row.status === 'ready' || row.status === 'audio_deleted') return this.dto(row);
      if (!row.audio_key) throw new Problem(409, 'audio_deleted', 'The recording was deleted.');
      return this.dto(await this.handOver(sys, id, row.centre_id, requestId));
    });
  }

  /**
   * The `voice` consumer's handler for `voice.uploaded`: send the audio to ai-service with the
   * session's roster as hints. `consented_real` audio never goes to a service that is not local
   * (ADR-0007, OD-51). Without ai-service, the note fails with "Type the note instead".
   */
  async dispatch(voiceId: string) {
    const job = await this.db.asSystem(async (sys) => {
      const v = await sys
        .selectFrom('records.voice_notes as v')
        .innerJoin('records.session_records as r', 'r.id', 'v.session_record_id')
        .select([
          'v.id',
          'v.status',
          'v.audio_key',
          'v.data_class',
          'v.duration_s',
          'v.teacher_id',
          'r.id as record_id',
          'r.group_session_id',
        ])
        .where('v.id', '=', voiceId)
        .executeTakeFirst();
      if (!v || v.status !== 'transcribing' || !v.audio_key) return null;
      const roster = await sessionStudents(sys, v.group_session_id);
      const a = await sys
        .selectFrom('records.assessments')
        .select(['title', 'max_score'])
        .where('session_record_id', '=', v.record_id)
        .executeTakeFirst();
      const teacher = await sys
        .selectFrom('org.teachers')
        .select('display_name')
        .where('id', '=', v.teacher_id)
        .executeTakeFirst();
      return { v, roster, a, teacher };
    });
    if (!job) return 'skipped';
    if (!this.ai || !this.c.AI_SERVICE_TOKEN) {
      await this.result(voiceId, { status: 'failed', code: 'stt_unavailable' });
      return 'stt_unavailable';
    }
    if (job.v.data_class === 'consented_real' && !this.ai.local) {
      await this.result(voiceId, { status: 'failed', code: 'data_safety_refused' });
      return 'data_safety_refused';
    }
    const audio = await this.store.get(job.v.audio_key!);
    if (!audio) {
      await this.result(voiceId, { status: 'failed', code: 'audio_missing' });
      return 'audio_missing';
    }
    try {
      const { etaSeconds } = await this.ai.submit(
        {
          voiceId,
          dataClass: job.v.data_class as 'synthetic' | 'consented_real',
          roster: job.roster.map((s) => ({ id: s.id, displayName: s.name, nicknames: [] })),
          assessment: job.a ? { title: job.a.title, maxScore: Number(job.a.max_score) } : null,
          durationS: job.v.duration_s,
          extraNames: job.teacher ? [job.teacher.display_name] : [],
          callbackUrl: `${this.callbackBase()}/v1/internal/voice-results/${voiceId}`,
        },
        { bytes: audio.bytes, mime: audio.contentType },
      );
      if (etaSeconds)
        await this.db.asSystem((sys) =>
          sys
            .updateTable('records.voice_notes')
            .set({ eta_seconds: etaSeconds })
            .where('id', '=', voiceId)
            .execute(),
        );
      return 'submitted';
    } catch (err) {
      this.log.warn({ err, voiceId }, 'ai-service did not take the note');
      await this.result(voiceId, { status: 'failed', code: 'stt_unavailable' });
      return 'stt_unavailable';
    }
  }

  private callbackBase() {
    return process.env.CORE_API_URL ?? `http://127.0.0.1:${this.c.CORE_API_PORT}`;
  }

  /** ai-service's answer (internal route, shared token). Items naming someone off the roster stay unmatched. */
  async result(voiceId: string, body: VoiceResult, token?: string | null) {
    if (token !== undefined) {
      const want = this.c.AI_SERVICE_TOKEN;
      if (
        !want ||
        !token ||
        token.length !== want.length ||
        !timingSafeEqual(Buffer.from(token), Buffer.from(want))
      )
        throw notFound('route');
    }
    await this.db.asSystem(async (sys) => {
      const v = await sys
        .selectFrom('records.voice_notes as v')
        .innerJoin('records.session_records as r', 'r.id', 'v.session_record_id')
        .select([
          'v.id',
          'v.status',
          'v.centre_id',
          'r.id as record_id',
          'r.status as record_status',
        ])
        .where('v.id', '=', voiceId)
        .forUpdate()
        .executeTakeFirst();
      if (!v) throw notFound('voice note');
      if (v.record_status === 'confirmed' || v.status === 'ready') return; // a late answer changes nothing
      if (body.status === 'ready' && body.result) {
        const roster = new Set(
          (
            await sys
              .selectFrom('records.record_entries')
              .select('student_id')
              .where('session_record_id', '=', v.record_id)
              .execute()
          ).map((x) => x.student_id),
        );
        const on = (sid: string | null) => !!sid && roster.has(sid);
        // Never trust IDs blindly: only students of this session are attached or offered. A name
        // that does not point at one stays unmatched, for the teacher to place (FUP-VOI-04).
        const items: StoredItem[] = body.result.items.map((it) => {
          const candidates = it.candidates.filter(on);
          const suggestions = (it.suggestions ?? []).filter(on);
          if (it.identity === 'matched' && !on(it.studentId))
            return { ...it, identity: 'unknown', studentId: null, candidates: [], suggestions };
          if (it.identity === 'ambiguous' && candidates.length < 2)
            return {
              ...it,
              identity: 'unknown',
              studentId: null,
              candidates: [],
              suggestions: candidates,
            };
          return {
            ...it,
            studentId: it.identity === 'matched' ? it.studentId : null,
            candidates,
            suggestions,
          };
        });
        const open = items.some((x) => x.identity === 'ambiguous' || x.identity === 'unknown');
        await sys
          .updateTable('records.voice_notes')
          .set({
            status: 'ready',
            transcript: body.result.transcript,
            model_version: body.result.modelVersion,
            stt_provider: 'ai-service',
            failure_code: null,
          })
          .where('id', '=', voiceId)
          .execute();
        await sys
          .updateTable('records.voice_extractions')
          .set({
            proposal: JSON.stringify({ items }),
            model_version: body.result.modelVersion,
            resolved: '{}',
            discarded: [],
            status: open ? 'clarification_needed' : 'proposed',
          })
          .where('voice_note_id', '=', voiceId)
          .execute();
        await writeAudit(sys, {
          actorId: null,
          actorType: 'ai',
          centreId: v.centre_id,
          action: 'voice.processed',
          objectType: 'voice_note',
          objectRef: voiceId,
          after: {
            recordId: v.record_id,
            items: items.length,
            needsIdentity: open,
            modelVersion: body.result.modelVersion,
            sttMs: body.result.latencyMs?.stt ?? null,
            totalMs: body.result.latencyMs?.total ?? null,
          },
        });
      } else {
        await sys
          .updateTable('records.voice_notes')
          .set({ status: 'failed', failure_code: (body.code ?? 'stt_failed').slice(0, 40) })
          .where('id', '=', voiceId)
          .execute();
        await writeAudit(sys, {
          actorId: null,
          actorType: 'ai',
          centreId: v.centre_id,
          action: 'voice.failed',
          objectType: 'voice_note',
          objectRef: voiceId,
          after: { code: body.code ?? 'stt_failed' },
        });
      }
    });
  }

  /** V02: 202 while processing; 503 with "Type the note instead" when it failed or took too long. */
  async extraction(userId: string, voiceId: string, lang: Lang) {
    const v = await this.noteAccess(userId, voiceId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, v.centre_id);
      if (v.status === 'queued' || v.status === 'uploaded')
        throw new Problem(409, 'not_uploaded', 'Upload the recording first.');
      if (v.status === 'failed')
        throw new Problem(
          503,
          v.failure_code === 'stt_unavailable' ? 'stt_unavailable' : 'stt_failed',
          'This note could not be processed. The audio is kept. Type the note instead.',
          { reason: v.failure_code },
        );
      if (v.status !== 'ready' && v.status !== 'audio_deleted') {
        const since = v.submitted_at ? Date.now() - v.submitted_at.getTime() : 0;
        if (since > VOICE_TIMEOUT_MS)
          throw new Problem(503, 'stt_timeout', 'This note is taking too long. The audio is kept.');
        const est = v.eta_seconds ?? Math.max(10, Math.round(v.duration_s * 0.8) + 10);
        return { pending: true as const, etaSeconds: Math.max(3, Math.round(est - since / 1000)) };
      }
      return { pending: false as const, body: await this.extractionDto(sys, voiceId, lang) };
    });
  }

  private async extractionDto(sys: Tx, voiceId: string, lang: Lang) {
    void lang;
    const x = await sys
      .selectFrom('records.voice_extractions as x')
      .innerJoin('records.voice_notes as v', 'v.id', 'x.voice_note_id')
      .select([
        'x.id',
        'x.status',
        'x.proposal',
        'x.resolved',
        'x.discarded',
        'v.transcript',
        'v.session_record_id',
      ])
      .where('x.voice_note_id', '=', voiceId)
      .executeTakeFirstOrThrow();
    const items = ((x.proposal as { items?: StoredItem[] } | null)?.items ?? []) as StoredItem[];
    const resolved = (x.resolved ?? {}) as Record<string, string>;
    const roster = await sys
      .selectFrom('records.record_entries')
      .select('student_id')
      .where('session_record_id', '=', x.session_record_id)
      .execute();
    const a = await sys
      .selectFrom('records.assessments')
      .select(['title', 'max_score'])
      .where('session_record_id', '=', x.session_record_id)
      .executeTakeFirst();
    const names = await namesOf(sys, [
      ...roster.map((r) => r.student_id),
      ...items.flatMap((i) => [i.studentId, ...i.candidates, ...(i.suggestions ?? [])]),
      ...Object.values(resolved),
    ]);
    const mentioned = new Set<string>();
    const out = items.map((it) => {
      const chosen = resolved[it.id];
      const studentId = it.identity === 'matched' ? it.studentId : (chosen ?? null);
      if (studentId) mentioned.add(studentId);
      return {
        id: it.id,
        identity:
          (it.identity === 'ambiguous' || it.identity === 'unknown') && chosen
            ? ('matched' as const)
            : it.identity,
        student: studentId ? ref(names, studentId) : null,
        candidates: it.candidates.map((c) => ref(names, c)),
        suggestions:
          it.identity === 'unknown' && !chosen
            ? (it.suggestions ?? []).map((c) => ref(names, c))
            : [],
        mention: it.mention,
        field: it.field,
        value: it.value,
        confidence: it.confidence,
        band: it.band ?? bandOf(it.confidence),
        span: it.span,
        sourceText: it.sourceText,
        outOfRange: it.outOfRange,
      };
    });
    return {
      id: x.id,
      voiceNoteId: voiceId,
      status: (x.status === 'superseded' ? 'proposed' : x.status) as
        'proposed' | 'clarification_needed' | 'accepted',
      // Receipt only (BR-APR-05): the teacher's own; never a parent's, never analytics.
      transcript: x.transcript ?? '',
      audioUrl: null,
      items: out,
      discardedItemIds: x.discarded,
      unmentioned: roster
        .filter((r) => !mentioned.has(r.student_id))
        .map((r) => ref(names, r.student_id))
        .sort((p, q) => p.displayName.localeCompare(q.displayName, 'ar')),
      assessment: a ? { title: a.title, maxScore: Number(a.max_score) } : null,
    };
  }

  private async extractionAccess(userId: string, extractionId: string) {
    const x = await this.db.asUser(userId, async (tx) =>
      tx
        .selectFrom('records.voice_extractions')
        .select(['id', 'voice_note_id'])
        .where('id', '=', extractionId)
        .executeTakeFirst(),
    );
    if (!x) throw notFound('extraction');
    const v = await this.noteAccess(userId, x.voice_note_id);
    return { x, v };
  }

  private async refresh(sys: Tx, extractionId: string) {
    const x = await sys
      .selectFrom('records.voice_extractions')
      .select(['proposal', 'resolved', 'discarded', 'status'])
      .where('id', '=', extractionId)
      .executeTakeFirstOrThrow();
    if (x.status === 'accepted') return;
    const items = ((x.proposal as { items?: StoredItem[] } | null)?.items ?? []) as StoredItem[];
    const resolved = (x.resolved ?? {}) as Record<string, string>;
    const open = items.some(
      (i) =>
        (i.identity === 'ambiguous' || i.identity === 'unknown') &&
        !resolved[i.id] &&
        !x.discarded.includes(i.id),
    );
    await sys
      .updateTable('records.voice_extractions')
      .set({ status: open ? 'clarification_needed' : 'proposed' })
      .where('id', '=', extractionId)
      .execute();
  }

  /** T07: the teacher picks the student. Never a guess: a candidate, or (unknown) one of the roster. */
  async resolveIdentity(
    userId: string,
    extractionId: string,
    b: { itemId: string; studentId: string },
    lang: Lang,
  ) {
    const { x, v } = await this.extractionAccess(userId, extractionId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, v.centre_id);
      const row = await sys
        .selectFrom('records.voice_extractions')
        .selectAll()
        .where('id', '=', x.id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const items = ((row.proposal as { items?: StoredItem[] } | null)?.items ??
        []) as StoredItem[];
      const it = items.find((i) => i.id === b.itemId);
      if (!it || (it.identity !== 'ambiguous' && it.identity !== 'unknown'))
        throw new Problem(422, 'not_ambiguous', 'This item needs no choice.');
      const onRoster = await sys
        .selectFrom('records.record_entries')
        .select('id')
        .where('session_record_id', '=', v.session_record_id)
        .where('student_id', '=', b.studentId)
        .executeTakeFirst();
      const allowed =
        it.identity === 'ambiguous' ? it.candidates.includes(b.studentId) : !!onRoster;
      if (!allowed) throw new Problem(422, 'not_a_candidate', 'Pick one of the listed students.');
      await sys
        .updateTable('records.voice_extractions')
        .set({
          resolved: JSON.stringify({ ...((row.resolved ?? {}) as object), [it.id]: b.studentId }),
          discarded: row.discarded.filter((d) => d !== it.id),
        })
        .where('id', '=', x.id)
        .execute();
      await this.refresh(sys, x.id);
      return this.extractionDto(sys, v.id, lang);
    });
  }

  /** The teacher drops an item: nothing from it is saved; an unclear name no longer blocks confirm. */
  async discardItem(userId: string, extractionId: string, itemId: string, lang: Lang) {
    const { x, v } = await this.extractionAccess(userId, extractionId);
    return this.db.asSystem(async (sys) => {
      await requireExtra(sys, v.centre_id);
      const row = await sys
        .selectFrom('records.voice_extractions')
        .selectAll()
        .where('id', '=', x.id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const items = ((row.proposal as { items?: StoredItem[] } | null)?.items ??
        []) as StoredItem[];
      if (!items.some((i) => i.id === itemId)) throw notFound('item');
      const resolved = { ...((row.resolved ?? {}) as Record<string, string>) };
      delete resolved[itemId];
      await sys
        .updateTable('records.voice_extractions')
        .set({
          resolved: JSON.stringify(resolved),
          discarded: [...new Set([...row.discarded, itemId])],
        })
        .where('id', '=', x.id)
        .execute();
      await this.refresh(sys, x.id);
      return this.extractionDto(sys, v.id, lang);
    });
  }

  /**
   * Retention job (docs/10 §4, BR-DAT-04): audio 30 days after upload, transcripts after 90.
   * Deleting audio never changes a confirmed record (FUP-VOI-05 AC2). Daily, and safe to rerun.
   */
  async retention(now = new Date()) {
    const due = await this.db.asSystem((sys) =>
      sys
        .selectFrom('records.voice_notes')
        .select(['id', 'audio_key', 'centre_id'])
        .where('delete_after', '<=', now)
        .where('audio_key', 'is not', null)
        .execute(),
    );
    for (const v of due) {
      await this.store.delete(v.audio_key!);
      await this.db.asSystem(async (sys) => {
        await sys
          .updateTable('records.voice_notes')
          .set({ audio_key: null, status: 'audio_deleted' })
          .where('id', '=', v.id)
          .execute();
        await writeAudit(sys, {
          actorId: null,
          actorType: 'system',
          centreId: v.centre_id,
          action: 'voice.audio_deleted',
          objectType: 'voice_note',
          objectRef: v.id,
          reason: 'Retention: audio is kept 30 days after upload (BR-DAT-04)',
        });
      });
    }
    const transcripts = await this.db.asSystem(async (sys) => {
      const rows = await sys
        .updateTable('records.voice_notes')
        .set({ transcript: null })
        .where('transcript_delete_after', '<=', now)
        .where('transcript', 'is not', null)
        .returning(['id'])
        .execute();
      // The proposal quotes the transcript: its source words go with it.
      if (rows.length)
        await sql`UPDATE records.voice_extractions x SET proposal = jsonb_set(x.proposal, '{items}',
            (SELECT coalesce(jsonb_agg(i || '{"sourceText": ""}'::jsonb), '[]'::jsonb) FROM jsonb_array_elements(x.proposal -> 'items') i))
          WHERE x.voice_note_id = ANY (${rows.map((r) => r.id)}::uuid[]) AND x.proposal IS NOT NULL`.execute(
          sys,
        );
      return rows.length;
    });
    return { audioDeleted: due.length, transcriptsBlanked: transcripts };
  }

  /** Demo / e2e (local only): an ai-service-shaped result for the latest note, through `result`. */
  async demoResult(result: NonNullable<VoiceResult['result']>) {
    const v = await this.db.asSystem((sys) =>
      sys
        .selectFrom('records.voice_notes')
        .select('id')
        .orderBy('created_at', 'desc')
        .executeTakeFirst(),
    );
    if (!v) throw new Problem(409, 'no_voice_note', 'Record a voice note first.');
    await this.result(v.id, { status: 'ready', result });
    return { voiceId: v.id, items: result.items.length };
  }
}

export const retentionDates = (uploadedOn: string) => ({
  audio: addDays(uploadedOn, AUDIO_DAYS),
  transcript: addDays(uploadedOn, TRANSCRIPT_DAYS),
});
