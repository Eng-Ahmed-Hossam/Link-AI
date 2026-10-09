import { Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { WHATSAPP_SENDER, type WhatsAppSender } from '../adapters/whatsapp';
import { routes } from '../contract/routes';
import { MessagingWebhookBody } from '../contract/followup';
import { Caller, Endpoint, type In, Input, type Principal } from '../platform/http';
import { Problem, notFound } from '../platform/problem';
import { requestIdOf } from '../platform/request-context';
import { Assistant } from './assistant';
import { Cases } from './cases';
import { Messages } from './messages';
import { Owner } from './owner';
import { Records } from './records';
import { Voice } from './voice';

const key = (req: Request) => req.header('idempotency-key') ?? undefined;

/** The follow-up endpoints (07 §2b–§2d). Every one checks the Follow-up extra server-side (OD-58). */
@Controller()
export class FollowupController {
  constructor(
    @Inject(Records) private readonly records: Records,
    @Inject(Voice) private readonly voice: Voice,
    @Inject(Cases) private readonly cases: Cases,
    @Inject(Messages) private readonly messages: Messages,
    @Inject(Owner) private readonly owner: Owner,
    @Inject(WHATSAPP_SENDER) private readonly sender: WhatsAppSender,
    @Inject(Assistant) private readonly assistant: Assistant,
  ) {}

  // ── Ask Link (off unless a local LLM is configured) ──────────────────────────
  @Endpoint(routes.assistantBriefing)
  briefing(@Caller() p: Principal) {
    return this.assistant.briefing(p.userId, p.lang);
  }
  @Endpoint(routes.assistantTurn)
  async turn(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.assistantTurn>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const events = await this.assistant.turn(p.userId, i.body.text, p.lang);
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    return events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  }
  @Endpoint(routes.assistantTranscribe)
  transcribe(@Caller() _p: Principal, @Req() req: Request) {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    return this.assistant.transcribe(body, req.header('content-type') ?? 'audio/webm');
  }

  // ── teacher ──────────────────────────────────────────────────────────────────
  @Endpoint(routes.teacherToday)
  today(@Caller() p: Principal) {
    return this.records.teacherToday(p.userId, p.lang);
  }
  @Endpoint(routes.roster)
  roster(@Caller() p: Principal, @Input() i: In<typeof routes.roster>) {
    return this.records.roster(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.listRecords)
  listRecords(@Caller() p: Principal, @Input() i: In<typeof routes.listRecords>) {
    return this.records.list(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.openRecord)
  async openRecord(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.openRecord>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const r = await this.records.open(
      p.userId,
      i.params.id,
      i.body.groupSessionId,
      p.lang,
      requestIdOf(req),
    );
    res.status(r.created ? 201 : 200);
    return r.record;
  }
  @Endpoint(routes.getRecord)
  getRecord(@Caller() p: Principal, @Input() i: In<typeof routes.getRecord>) {
    return this.records.get(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.saveDraft)
  saveDraft(@Caller() p: Principal, @Input() i: In<typeof routes.saveDraft>) {
    return this.records.saveDraft(p.userId, i.params.id, i.body, p.lang);
  }
  @Endpoint(routes.confirmRecord)
  confirm(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.confirmRecord>,
    @Req() req: Request,
  ) {
    return this.records.confirm(p.userId, i.params.id, key(req), p.lang, requestIdOf(req));
  }
  @Endpoint(routes.addCorrection)
  correct(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.addCorrection>,
    @Req() req: Request,
  ) {
    return this.records.correct(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.requestCorrection)
  requestCorrection(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.requestCorrection>,
    @Req() req: Request,
  ) {
    return this.records.requestCorrection(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.closeCorrectionRequest)
  closeRequest(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.closeCorrectionRequest>,
    @Req() req: Request,
  ) {
    return this.records.closeCorrectionRequest(p.userId, i.params.id, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.student)
  student(@Caller() p: Principal, @Input() i: In<typeof routes.student>) {
    return this.records.student(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.addNote)
  addNote(@Caller() p: Principal, @Input() i: In<typeof routes.addNote>, @Req() req: Request) {
    return this.records.addNote(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.suggestNote)
  suggestNote(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.suggestNote>,
    @Req() req: Request,
  ) {
    return this.records.suggestNote(p.userId, i.params.id, p.lang, requestIdOf(req));
  }

  // ── voice ────────────────────────────────────────────────────────────────────
  @Endpoint(routes.createVoiceNote)
  createVoice(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.createVoiceNote>,
    @Req() req: Request,
  ) {
    return this.voice.create(p.userId, i.body, key(req), requestIdOf(req));
  }
  /** The signed upload: no session needed (the URL is the credential, 15 minutes). */
  @Endpoint(routes.uploadVoiceAudio)
  upload(@Input() i: In<typeof routes.uploadVoiceAudio>, @Req() req: Request) {
    const q = req.query as Record<string, string | undefined>;
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    return this.voice.putAudio(i.params.id, q.exp, q.sig, body, req.header('content-type') ?? '');
  }
  @Endpoint(routes.voiceUploaded)
  uploaded(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.voiceUploaded>,
    @Req() req: Request,
  ) {
    return this.voice.uploaded(p.userId, i.params.id, requestIdOf(req));
  }
  @Endpoint(routes.retryVoice)
  retry(@Caller() p: Principal, @Input() i: In<typeof routes.retryVoice>, @Req() req: Request) {
    return this.voice.retry(p.userId, i.params.id, requestIdOf(req));
  }
  @Endpoint(routes.extraction)
  async extraction(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.extraction>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const x = await this.voice.extraction(p.userId, i.params.id, p.lang);
    if (x.pending) {
      res.status(202);
      return { status: 'transcribing' as const, etaSeconds: x.etaSeconds };
    }
    return x.body;
  }
  @Endpoint(routes.resolveIdentity)
  resolve(@Caller() p: Principal, @Input() i: In<typeof routes.resolveIdentity>) {
    return this.voice.resolveIdentity(p.userId, i.params.id, i.body, p.lang);
  }
  @Endpoint(routes.discardItem)
  discard(@Caller() p: Principal, @Input() i: In<typeof routes.discardItem>) {
    return this.voice.discardItem(p.userId, i.params.id, i.body.itemId, p.lang);
  }
  /** ai-service → core-api: loopback only, with the shared token; anything else is 404. */
  @Endpoint(routes.voiceResult)
  async voiceResult(@Input() i: In<typeof routes.voiceResult>, @Req() req: Request) {
    const ip = req.socket.remoteAddress ?? '';
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) throw notFound('route');
    await this.voice.result(i.params.id, i.body, req.header('x-link-internal-token') ?? null);
  }

  // ── cases ────────────────────────────────────────────────────────────────────
  @Endpoint(routes.listCases)
  listCases(@Caller() p: Principal) {
    return this.cases.list(p.userId, p.lang);
  }
  @Endpoint(routes.getCase)
  getCase(@Caller() p: Principal, @Input() i: In<typeof routes.getCase>) {
    return this.cases.get(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.addAttempt)
  attempt(@Caller() p: Principal, @Input() i: In<typeof routes.addAttempt>, @Req() req: Request) {
    return this.cases.attempt(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.dismissCase)
  dismiss(@Caller() p: Principal, @Input() i: In<typeof routes.dismissCase>, @Req() req: Request) {
    return this.cases.dismiss(p.userId, i.params.id, i.body.reason, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.reopenCase)
  reopen(@Caller() p: Principal, @Input() i: In<typeof routes.reopenCase>, @Req() req: Request) {
    return this.cases.reopen(p.userId, i.params.id, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.seatCheck)
  seatCheck(@Caller() p: Principal, @Input() i: In<typeof routes.seatCheck>) {
    return this.cases.seatCheck(p.userId, i.params.id, p.lang);
  }

  // ── messages ─────────────────────────────────────────────────────────────────
  @Endpoint(routes.listMessages)
  listMessages(@Caller() p: Principal) {
    return this.messages.list(p.userId, p.lang);
  }
  @Endpoint(routes.getMessage)
  getMessage(@Caller() p: Principal, @Input() i: In<typeof routes.getMessage>) {
    return this.messages.get(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.draftMessage)
  draft(@Caller() p: Principal, @Input() i: In<typeof routes.draftMessage>, @Req() req: Request) {
    return this.messages.draft(p.userId, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.editMessage)
  edit(@Caller() p: Principal, @Input() i: In<typeof routes.editMessage>) {
    return this.messages.edit(p.userId, i.params.id, i.body, p.lang);
  }
  @Endpoint(routes.approveMessage)
  approve(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.approveMessage>,
    @Req() req: Request,
  ) {
    return this.messages.approve(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.reviseMessage)
  revise(@Caller() p: Principal, @Input() i: In<typeof routes.reviseMessage>, @Req() req: Request) {
    return this.messages.revise(p.userId, i.params.id, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.sentManually)
  sentManually(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.sentManually>,
    @Req() req: Request,
  ) {
    return this.messages.sentManually(p.userId, i.params.id, p.lang, requestIdOf(req));
  }
  /** Provider → Link: the signature is checked on the exact bytes before anything is parsed. */
  @Endpoint(routes.messagingWebhook)
  async webhook(@Input() i: In<typeof routes.messagingWebhook>, @Req() req: Request) {
    if (i.params.provider !== this.sender.name || !this.sender.sends) throw notFound('provider');
    const raw = (req as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
    if (!this.sender.verifyWebhook(raw, req.header(`x-${this.sender.name}-signature`)))
      throw new Problem(401, 'invalid_signature', 'The webhook signature is not valid.');
    const e = MessagingWebhookBody.parse(JSON.parse(raw.toString('utf8')));
    return { ok: true as const, outcome: await this.messages.webhook(e) };
  }

  // ── owner web ────────────────────────────────────────────────────────────────
  @Endpoint(routes.ownerToday)
  ownerToday(@Caller() p: Principal, @Input() i: In<typeof routes.ownerToday>) {
    return this.owner.today(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.centreStudents)
  centreStudents(@Caller() p: Principal, @Input() i: In<typeof routes.centreStudents>) {
    return this.owner.students(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.centreSessions)
  centreSessions(@Caller() p: Principal, @Input() i: In<typeof routes.centreSessions>) {
    return this.owner.sessions(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.listRules)
  rules(@Caller() p: Principal, @Input() i: In<typeof routes.listRules>) {
    return this.owner.rules(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.changeRule)
  changeRule(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.changeRule>,
    @Req() req: Request,
  ) {
    return this.owner.change(
      p.userId,
      i.params.id,
      i.params.code,
      i.body,
      p.lang,
      requestIdOf(req),
    );
  }
  @Endpoint(routes.approveRule)
  approveRule(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.approveRule>,
    @Req() req: Request,
  ) {
    return this.owner.approve(p.userId, i.params.id, i.params.code, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.rejectRule)
  rejectRule(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.rejectRule>,
    @Req() req: Request,
  ) {
    return this.owner.reject(p.userId, i.params.id, i.params.code, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.activity)
  activity(@Caller() p: Principal, @Input() i: In<typeof routes.activity>) {
    return this.owner.activity(p.userId, i.params.id, p.lang);
  }

  // ── parent ───────────────────────────────────────────────────────────────────
  @Endpoint(routes.parentUpdates)
  updates(@Caller() p: Principal) {
    return this.messages.parentUpdates(p.userId, p.lang);
  }
  @Endpoint(routes.centreGroups)
  centreGroups(@Caller() p: Principal) {
    return this.messages.centreGroups(p.userId, p.lang);
  }
}
