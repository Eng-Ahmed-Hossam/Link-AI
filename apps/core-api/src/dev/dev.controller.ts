import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  type OnModuleDestroy,
  Param,
  Post,
} from '@nestjs/common';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import { z } from 'zod';
import { demoId } from '../../seeds/demo-id';
import { Phones } from '../identity/phone';
import { pendingCentres, verifyCentre } from '../ops/verify-centre';
import { Database } from '../platform/db';
import { FLAG, centreFlag } from '../platform/flags';
import { Problem } from '../platform/problem';
import { CONFIG } from '../platform/di';
import type { Config } from '../config';
import { EnrolmentJobs } from '../enrolment/jobs';
import { RentInvoices } from '../ledger/rent-invoices';
import { Money } from '../payments/money';
import { LOGGER, type Logger } from '../platform/logger';
import { Redises } from '../platform/redis';
import { addDays, cairoToday, isoWeekday } from '../platform/time';
import { Scheduler, moneyJobs } from '../worker/jobs';
import { followupJobs } from '../worker/followup';
import { Messages } from '../followup/messages';
import { Records } from '../followup/records';
import { Voice } from '../followup/voice';
import * as fx from '@link/mocks/fixtures';

/**
 * Demo controls for live mode (docs/14 §5.2). This controller is registered ONLY when
 * APP_ENV=local (see app.module.ts), so these paths do not exist anywhere else. Sample data only.
 */
const FeaturesBody = z.object({ centreId: z.uuid(), followupExtra: z.boolean() });
const SettingsBody = z.object({
  marketplace: z.boolean().optional(),
  phase2: z.boolean().optional(),
});

/** The Phase 2 flags the demo "Phase 2" switch turns on together (api-client PHASE2_FLAGS). */
const PHASE2 = [
  'followup.owner_nav',
  'followup.records',
  'followup.voice_notes',
  'followup.whatsapp_updates',
  'parent.updates_feed',
  'teacher.recorded_badge',
];

const VerifyBody = z.object({ centreId: z.uuid() });
const JobBody = z.object({ name: z.string().max(40) });
const ExtraBody = z.object({ on: z.boolean() });
const ProviderBody = z.object({
  outcome: z.enum(['advance', 'fail']).default('advance'),
  messageId: z.uuid().optional(),
});
const ReplyBody = z.object({
  body: z.string().max(1000).optional(),
  messageId: z.uuid().optional(),
});
/** The sample parent's reply the Demo controls deliver (as the mock's `demoReply`). */
const DEMO_REPLY = 'عندها درس تاني الأربع';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The connected story's fixed parts (docs/testing/walkthrough.md; same as the mock's STORY). */
const STORY = {
  centreId: demoId('cen-nour'),
  hallId: demoId('hall-nour-1'),
  teacherId: demoId('tch-salma'),
  teacherUser: demoId('usr-salma'),
  weekday: 6,
  start: '16:00',
  childId: demoId('chd-mariam'),
};

const migratorUrl = () => {
  const url = process.env.DATABASE_URL_MIGRATOR;
  if (!url) throw new Problem(500, 'internal_error', 'DATABASE_URL_MIGRATOR is not set.');
  return url;
};

@Controller('__demo')
export class DevController implements OnModuleDestroy {
  private migrator?: Kysely<unknown>;

  private readonly scheduler: Scheduler;

  constructor(
    @Inject(Database) private readonly app: Database,
    @Inject(Phones) private readonly phones: Phones,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(Redises) redis: Redises,
    @Inject(LOGGER) log: Logger,
    @Inject(Money) money: Money,
    @Inject(EnrolmentJobs) jobs: EnrolmentJobs,
    @Inject(RentInvoices) rent: RentInvoices,
    @Inject(Messages) private readonly messages: Messages,
    @Inject(Voice) private readonly voice: Voice,
    @Inject(Records) private readonly records: Records,
  ) {
    this.scheduler = new Scheduler(redis, log, [
      ...moneyJobs({ jobs, money, rent }),
      ...followupJobs({ voice, messages }),
    ]);
  }

  /** Flags are ops data (app_ops in production); locally the migrator writes them. */
  private db() {
    return (this.migrator ??= new Kysely<unknown>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({ connectionString: migratorUrl(), max: 2 }),
      }),
    }));
  }

  async onModuleDestroy() {
    await this.migrator?.destroy();
  }

  /** Wipe the local database back to the demo world (`pnpm seed:demo`). */
  @Post('reset')
  @HttpCode(200)
  async reset() {
    // Imported here so the sample fixtures load only when someone resets.
    const { seedDemo } = await import('../../seeds/demo');
    return seedDemo(migratorUrl());
  }

  /** Paid extra per centre (OD-58), as Link ops would switch it. */
  @Post('features')
  @HttpCode(200)
  async features(@Body() raw: unknown) {
    const b = FeaturesBody.parse(raw);
    await this.setFlag(FLAG.followupExtra, 'centre', b.centreId, b.followupExtra);
    return { followupExtra: b.followupExtra };
  }

  /** Global switches: the marketplace and the Phase 2 surfaces. */
  @Post('settings')
  @HttpCode(200)
  async settings(@Body() raw: unknown) {
    const b = SettingsBody.parse(raw);
    if (b.marketplace !== undefined)
      await this.setFlag(FLAG.marketplace, 'global', null, b.marketplace);
    if (b.phase2 !== undefined)
      for (const k of PHASE2) await this.setFlag(k, 'global', null, b.phase2);
    return { ok: true };
  }

  private async setFlag(
    key: string,
    scope: 'global' | 'centre',
    scopeId: string | null,
    on: boolean,
  ) {
    await sql`INSERT INTO platform.feature_flags (key, scope_type, scope_id, enabled)
      VALUES (${key}, ${scope}, ${scopeId ?? '00000000-0000-0000-0000-000000000000'}, ${on})
      ON CONFLICT (key, scope_type, scope_id) DO UPDATE SET enabled = EXCLUDED.enabled`.execute(
      this.db(),
    );
  }

  // ── Local ops stand-ins (the ops console comes later) ─────────────────────────
  /** Pending centres and moved pins waiting for Link ops. */
  @Get('pending-centres')
  pending() {
    return pendingCentres(this.app);
  }

  /** Verify a centre as Link ops would (audited, like `pnpm ops:verify-centre`). */
  @Post('verify-centre')
  @HttpCode(200)
  async verify(@Body() raw: unknown) {
    const b = VerifyBody.parse(raw);
    return verifyCentre(this.app, this.phones, b.centreId, 'demo_tools');
  }

  // ── The connected story (same paths and shapes as the mock server) ────────────
  /** Where the story is: its request, booking, group and enrolment, from the database. */
  @Get('story')
  story() {
    return this.app.asSystem(async (tx) => {
      const request = await tx
        .selectFrom('market.teacher_applications')
        .select(['id', 'stage', 'room_booking_id', 'requested_slots'])
        .where('teacher_id', '=', STORY.teacherId)
        .where('room_id', '=', STORY.hallId)
        .orderBy('created_at', 'desc')
        .execute()
        .then((rows) =>
          rows.find((r) =>
            (r.requested_slots as { weekday: number; start: string }[]).some(
              (x) => x.weekday === STORY.weekday && x.start === STORY.start,
            ),
          ),
        );
      const group = request?.room_booking_id
        ? await tx
            .selectFrom('market.groups')
            .select('id')
            .where('room_booking_id', '=', request.room_booking_id)
            .executeTakeFirst()
        : undefined;
      const done = group
        ? await tx
            .selectFrom('market.group_sessions')
            .select(sql<number>`count(*)::int`.as('n'))
            .where('group_id', '=', group.id)
            .where('starts_at', '<', new Date())
            .executeTakeFirstOrThrow()
        : { n: 0 };
      return {
        requestId: request?.id ?? null,
        stage: request?.stage ?? null,
        bookingId: request?.room_booking_id ?? null,
        groupId: group?.id ?? null,
        // Mariam's latest enrolment in the story group (the card seat of step 4).
        enrolmentId: group
          ? ((
              await tx
                .selectFrom('market.enrolments')
                .select('id')
                .where('group_id', '=', group.id)
                .where('student_id', '=', STORY.childId)
                .orderBy('created_at', 'desc')
                .executeTakeFirst()
            )?.id ?? null)
          : null,
        sessionsDone: done.n,
        followupExtra: await centreFlag(tx, FLAG.followupExtra, STORY.centreId),
      };
    });
  }

  /** "Reset story": the demo world, with the marketplace, Phase 2 and the Follow-up extra on. */
  @Post('story/reset')
  @HttpCode(200)
  async storyReset() {
    await this.reset();
    await this.setFlag(FLAG.marketplace, 'global', null, true);
    for (const k of PHASE2) await this.setFlag(k, 'global', null, true);
    await this.setFlag(FLAG.followupExtra, 'centre', STORY.centreId, true);
    // As the mock: Ms Salma's existing groups get their latest record (everyone present), so the
    // story group's first session is the record Today asks for in step 8.
    for (let i = 0; i < 10; i++) {
      const due = (await this.records.teacherToday(STORY.teacherUser, 'en')).recordDue;
      if (!due) break;
      await this.confirmWith(due.groupId, due.sessionId, () => 'present');
    }
    return this.story();
  }

  /** Open, fill and confirm a record through the same service the teacher app calls. */
  private async confirmWith(
    groupId: string,
    sessionId: string,
    attendance: (studentId: string) => 'present' | 'absent',
  ) {
    const { record } = await this.records.open(STORY.teacherUser, groupId, sessionId, 'en');
    await this.records.saveDraft(
      STORY.teacherUser,
      record.id,
      {
        entries: record.entries.map((e) => ({
          studentId: e.student.id,
          attendance: attendance(e.student.id),
        })),
      },
      'en',
    );
    return this.records.confirm(STORY.teacherUser, record.id, `story-${record.id}`, 'en');
  }

  /**
   * "Simulate first session done": the story group's calendar moves back so its next session took
   * place last Saturday (the booking, the enrolments' paid periods and the payments move with it),
   * exactly as the mock does. Session IDs stay, so seat counters stay right.
   */
  @Post('story/session-done')
  @HttpCode(200)
  async storySessionDone() {
    const { groupId } = await this.story();
    if (!groupId) throw new Problem(409, 'no_story_group', 'Open the story group first (step 3).');
    const today = cairoToday();
    let target = addDays(today, -1);
    while (isoWeekday(target) !== STORY.weekday) target = addDays(target, -1);
    // Moving a calendar is data surgery for the demo only: the migrator does it, as for flags.
    await this.db()
      .transaction()
      .execute(async (tx) => {
        const next = await sql<{ day: string }>`
        SELECT market.session_day(starts_at)::text AS day FROM market.group_sessions
        WHERE group_id = ${groupId} AND market.session_day(starts_at) >= ${today}::date
        ORDER BY starts_at LIMIT 1`.execute(tx);
        const day = next.rows[0]?.day;
        if (!day) throw new Problem(409, 'no_session', 'No upcoming session to complete.');
        const days = Math.round((Date.parse(day) - Date.parse(target)) / 86_400_000);
        const by = sql.lit(`${days} days`);
        // Two steps: shifting in place would meet the (group, starts_at) key on the way.
        await sql`UPDATE market.group_sessions SET starts_at = starts_at + interval '1000 years', ends_at = ends_at + interval '1000 years' WHERE group_id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE market.group_sessions SET starts_at = starts_at - interval '1000 years' - ${by}::interval, ends_at = ends_at - interval '1000 years' - ${by}::interval WHERE group_id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE market.group_sessions SET status = 'held', status_changed_at = now() WHERE group_id = ${groupId} AND status = 'scheduled' AND ends_at <= now()`.execute(
          tx,
        );
        await sql`UPDATE market.groups SET starts_on = starts_on - ${days}::int WHERE id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE market.room_bookings b SET starts_on = b.starts_on - ${days}::int FROM market.groups g WHERE g.id = ${groupId} AND b.id = g.room_booking_id`.execute(
          tx,
        );
        await sql`UPDATE market.room_booking_slots s SET active_dates = daterange(lower(s.active_dates) - ${days}::int, upper(s.active_dates), '[)') FROM market.groups g WHERE g.id = ${groupId} AND s.booking_id = g.room_booking_id`.execute(
          tx,
        );
        await sql`UPDATE market.teacher_applications a SET starts_on = a.starts_on - ${days}::int FROM market.groups g WHERE g.id = ${groupId} AND a.room_booking_id = g.room_booking_id`.execute(
          tx,
        );
        // Records keep their session; their date moves with the calendar (as the mock).
        await sql`UPDATE records.session_records SET session_date = session_date - ${days}::int WHERE group_id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE records.assessments SET taken_on = taken_on - ${days}::int WHERE group_id = ${groupId}`.execute(
          tx,
        );
        await sql`UPDATE market.enrolments SET current_period_start = current_period_start - ${days}::int, current_period_end = current_period_end - ${days}::int WHERE group_id = ${groupId} AND current_period_start IS NOT NULL`.execute(
          tx,
        );
        await sql`UPDATE ledger.payments p SET period_start = p.period_start - ${days}::int, period_end = p.period_end - ${days}::int FROM market.enrolments e WHERE e.id = p.enrolment_id AND e.group_id = ${groupId} AND p.period_start IS NOT NULL`.execute(
          tx,
        );
      });
    return this.story();
  }

  /** The parent pays a Fawry reference at an outlet (fake-pay sends the signed webhook). */
  @Post('fawry/:enrolmentId/pay')
  @HttpCode(200)
  async payFawry(@Param('enrolmentId') enrolmentId: string) {
    const p = await this.app.asSystem((tx) =>
      tx
        .selectFrom('ledger.payments')
        .select('fawry_reference')
        .where('enrolment_id', '=', z.uuid().parse(enrolmentId))
        .where('method', '=', 'fawry')
        .where('fawry_reference', 'is not', null)
        .orderBy('created_at', 'desc')
        .executeTakeFirst(),
    );
    if (!p?.fawry_reference)
      throw new Problem(404, 'not_found', 'No Fawry reference for this enrolment.');
    const r = await fetch(
      `${this.config.FAKE_PAY_URL}/v1/fawry-references/${p.fawry_reference}/pay`,
      { method: 'POST' },
    );
    return { ok: r.ok };
  }

  /** Run one scheduled job now (hold-expiry, funds-release, settlement, rent-invoices, …). */
  @Post('jobs/run')
  @HttpCode(200)
  async runJob(@Body() raw: unknown) {
    const b = JobBody.parse(raw);
    try {
      return { job: b.name, result: (await this.scheduler.runNow(b.name)) ?? null };
    } catch (e) {
      throw new Problem(422, 'unknown_job', (e as Error).message);
    }
  }

  // ── Follow-up (R3): the outside world for live mode ───────────────────────────
  /** What happened, for the presenter and the e2e suites (names in the asked language). */
  @Get('state')
  state() {
    return this.snapshot('en');
  }
  @Get('state/:lang')
  stateIn(@Param('lang') lang: string) {
    return this.snapshot(lang === 'ar' ? 'ar' : 'en');
  }

  private async snapshot(lang: 'ar' | 'en') {
    // Sample people have English names in the fixtures; Postgres keeps one (Arabic) name.
    const en = new Map<string, string>();
    for (const u of [...fx.staff, fx.parent]) en.set(demoId(u.id), u.name.en);
    for (const c of fx.children) en.set(demoId(c.id), c.name.en);
    return this.app.asSystem(async (tx) => {
      const names = new Map<string, string>();
      const ids = async (rows: { id: string; name: string | null }[]) => {
        for (const r of rows)
          names.set(r.id, lang === 'en' ? (en.get(r.id) ?? r.name ?? '') : (r.name ?? ''));
      };
      await ids(
        (await tx
          .selectFrom('org.students')
          .select(['id', 'display_name as name'])
          .execute()) as never,
      );
      await ids((await tx.selectFrom('identity.users').select(['id', 'name']).execute()) as never);
      const flags = await tx.selectFrom('platform.feature_flags').selectAll().execute();
      const on = (k: string) =>
        flags.some((f) => f.key === k && f.scope_type === 'global' && f.enabled);
      const signals = await tx
        .selectFrom('followup.signals as s')
        .leftJoin('followup.cases as c', 'c.signal_id', 's.id')
        .select([
          's.id',
          's.rule_code',
          's.rule_version',
          's.student_id',
          's.status',
          'c.id as case_id',
          's.explanation_en',
          's.explanation_ar',
          's.evidence',
        ])
        .orderBy('s.raised_at')
        .execute();
      const cases = await tx
        .selectFrom('followup.cases')
        .select([
          'id',
          'student_id',
          'assignee_id',
          'status',
          sql<string>`due_on::text`.as('due_on'),
        ])
        .orderBy('created_at')
        .execute();
      const msgs = await tx
        .selectFrom('messaging.messages as m')
        .select(['m.id', 'm.student_id', 'm.delivery_status', 'm.channel'])
        .select((eb) =>
          eb
            .selectFrom('messaging.inbound_messages as i')
            .select(sql<number>`count(*)::int`.as('n'))
            .whereRef('i.message_id', '=', 'm.id')
            .as('replies'),
        )
        .orderBy('m.created_at')
        .execute();
      const recs = await tx
        .selectFrom('records.session_records')
        .select(['id', 'status'])
        .execute();
      return {
        demo: {
          offline: false,
          phase2: on('followup.records'),
          sttDown: false,
          confirmFault: null,
          marketplace: on('marketplace.enabled'),
          dayOffset: 0,
          realStt: !!this.config.AI_SERVICE_URL,
        },
        counters: {
          confirmCalls: 0,
          confirmCommits: recs.filter((r) => r.status === 'confirmed').length,
        },
        records: {
          confirmed: recs.filter((r) => r.status === 'confirmed').length,
          drafts: recs.filter((r) => r.status === 'draft').map((r) => r.id),
        },
        signals: signals.map((x) => ({
          id: x.id,
          rule: x.rule_code,
          ruleVersion: x.rule_version,
          student: names.get(x.student_id) ?? '',
          status: x.status,
          caseId: x.case_id,
          explanation: lang === 'ar' ? x.explanation_ar : x.explanation_en,
          evidence: ((x.evidence as { recordIds?: string[] }).recordIds ?? []).map((recordId) => ({
            recordId,
            sessionDate: '',
          })),
        })),
        cases: cases.map((c) => ({
          id: c.id,
          student: names.get(c.student_id) ?? '',
          assignee: names.get(c.assignee_id) ?? '',
          status: c.status,
          dueOn: c.due_on,
        })),
        messages: msgs.map((m) => ({
          id: m.id,
          student: names.get(m.student_id) ?? '',
          status: m.delivery_status,
          channel: m.channel,
          replies: m.replies ?? 0,
        })),
      };
    });
  }

  /**
   * The outside world: whatsapp-fake reports Queued → Sent → Delivered (or Failed) through its
   * signed webhook. Link's status moves only when that webhook arrives (BR-APR-11).
   */
  @Post('provider')
  @HttpCode(200)
  async provider(@Body() raw: unknown) {
    const b = ProviderBody.parse(raw ?? {});
    const m = await this.app.asSystem((tx) => {
      let q = tx
        .selectFrom('messaging.messages')
        .select(['id', 'delivery_status', 'provider_message_id']);
      q = b.messageId
        ? q.where('id', '=', b.messageId)
        : q.where('delivery_status', 'in', ['queued', 'sent']).orderBy('approved_at', 'desc');
      return q.executeTakeFirst();
    });
    if (!m) throw new Problem(409, 'nothing_in_flight', 'No queued or sent message.');
    if (!['queued', 'sent'].includes(m.delivery_status))
      throw new Problem(409, 'not_in_flight', 'This message is not in flight.');
    // The gateway normally hands it over within a second; do it here if it has not yet (idempotent).
    if (!m.provider_message_id) await this.messages.send(m.id);
    const sent = await this.app.asSystem((tx) =>
      tx
        .selectFrom('messaging.messages')
        .select(['provider_message_id', 'delivery_status'])
        .where('id', '=', m.id)
        .executeTakeFirstOrThrow(),
    );
    if (!sent.provider_message_id)
      throw new Problem(409, 'not_handed_over', 'The provider has not taken the message.');
    const status =
      b.outcome === 'fail' ? 'failed' : sent.delivery_status === 'queued' ? 'sent' : 'delivered';
    const r = await fetch(
      `${this.config.WHATSAPP_FAKE_URL}/v1/messages/${encodeURIComponent(sent.provider_message_id)}/status`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          status,
          ...(status === 'failed' ? { reason: 'Provider reported: not delivered (sample)' } : {}),
        }),
      },
    );
    if (!r.ok) throw new Problem(502, 'provider_error', `whatsapp-fake answered ${r.status}.`);
    for (let i = 0; i < 40; i++) {
      const now = await this.app.asSystem((tx) =>
        tx
          .selectFrom('messaging.messages')
          .select('delivery_status')
          .where('id', '=', m.id)
          .executeTakeFirstOrThrow(),
      );
      if (now.delivery_status === status) return { id: m.id, status };
      await sleep(100);
    }
    throw new Problem(
      504,
      'webhook_not_received',
      'whatsapp-fake did not reach core-api (check WHATSAPP_FAKE_WEBHOOK_URL).',
    );
  }

  /** A parent reply through whatsapp-fake's inbound webhook (STOP takes effect at once). */
  @Post('reply')
  @HttpCode(200)
  async reply(@Body() raw: unknown) {
    const b = ReplyBody.parse(raw ?? {});
    const m = await this.app.asSystem((tx) => {
      let q = tx
        .selectFrom('messaging.messages as m')
        .innerJoin('org.guardians as g', 'g.id', 'm.guardian_id')
        .leftJoin('identity.users as u', 'u.id', 'g.user_id')
        .select(['m.id', 'm.case_id', 'm.provider_message_id', 'u.phone_enc', 'g.phone_encrypted']);
      q = b.messageId
        ? q.where('m.id', '=', b.messageId)
        : q
            .where('m.delivery_status', 'in', ['sent', 'delivered', 'read'])
            .orderBy('m.approved_at', 'desc');
      return q.executeTakeFirst();
    });
    if (!m)
      throw new Problem(409, 'nothing_delivered', 'No sent or delivered message to reply to.');
    const enc = m.phone_enc ?? m.phone_encrypted;
    if (!enc) throw new Problem(409, 'no_phone', 'This guardian has no phone on file.');
    const r = await fetch(`${this.config.WHATSAPP_FAKE_URL}/v1/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.phones.decrypt(enc),
        body: b.body ?? DEMO_REPLY,
        inReplyTo: m.provider_message_id,
      }),
    });
    if (!r.ok) throw new Problem(502, 'provider_error', `whatsapp-fake answered ${r.status}.`);
    return { messageId: m.id, caseId: m.case_id };
  }

  /** "Simulate a new day": open follow-ups' due dates move a day back (FUP-CAS-05 overdue). */
  @Post('new-day')
  @HttpCode(200)
  async newDay() {
    await sql`UPDATE followup.cases SET due_on = due_on - 1 WHERE status IN ('open', 'in_progress', 'awaiting_confirmation')`.execute(
      this.db(),
    );
    const { rows } = await sql<{ n: number }>`
      SELECT count(*)::int AS n FROM followup.cases c
      WHERE c.status IN ('open', 'in_progress', 'awaiting_confirmation')
        AND c.due_on < (now() AT TIME ZONE 'Africa/Cairo')::date
        AND NOT EXISTS (SELECT 1 FROM followup.case_attempts a WHERE a.case_id = c.id)`.execute(
      this.db(),
    );
    return { dayOffset: 1, overdue: rows[0]!.n };
  }

  /** e2e: an ai-service-shaped result for the latest voice note, through the same callback path. */
  @Post('voice-result')
  @HttpCode(200)
  voiceResult(@Body() raw: unknown) {
    return this.voice.demoResult(raw as Parameters<Voice['demoResult']>[0]);
  }

  @Post('story/extra')
  @HttpCode(200)
  async storyExtra(@Body() raw: unknown) {
    const b = ExtraBody.parse(raw);
    await this.setFlag(FLAG.followupExtra, 'centre', STORY.centreId, b.on);
    return this.story();
  }
}
