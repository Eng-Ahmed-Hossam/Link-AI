/**
 * Pilot metrics (A8), computed only from the append-only activity log plus the group schedule.
 * The main result is follow-up completion: did staff contact the family by the due date, and log
 * what they learned?
 */
import type { AuditRow } from '@link/mocks/followup';
import { sessionsOfGroup, type WorldData } from '@link/mocks/world';
import { cairoToday } from '@link/mocks/time';

export interface CaseFacts {
  caseId: string;
  openedAt: string;
  dueOn: string;
  firstContactAt: string | null;
  outcomeLogged: boolean;
  status: 'open' | 'resolved' | 'dismissed';
  dismissReason: string | null;
}
export interface DayRow {
  day: string;
  flags: number;
  contacts: number;
  outcomes: number;
  sessionsScheduled: number;
  recordsConfirmed: number;
  activeOwner: number;
  activeReception: number;
  activeTeacher: number;
}
export interface PilotMetrics {
  from: string;
  to: string;
  generatedAt: string;
  completion: {
    flagsRaised: number;
    casesOpened: number;
    contactedByDue: { n: number; of: number };
    outcomeLogged: { n: number; of: number };
    medianHoursFlagToContact: number | null;
    dismissed: { n: number; of: number; reasons: string[] };
    openPastDue: { n: number; of: number };
  };
  records: {
    sessionsScheduled: number;
    withConfirmedRecord: { n: number; of: number };
    medianHoursEndToConfirm: number | null;
    bySource: { tap: number; voice: number; mixed: number };
  };
  usage: { day: string; owner: number; reception: number; teacher: number }[];
  daily: DayRow[];
  cases: CaseFacts[];
}

const cairoDay = (iso: string) => cairoToday(new Date(iso));
const hours = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 3_600_000;
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function computeMetrics(
  events: AuditRow[],
  world: WorldData,
  now = new Date(),
): PilotMetrics {
  const ev = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const today = cairoToday(now);
  const from = world.startDate ?? (ev[0] ? cairoDay(ev[0].at) : today);

  // ── follow-ups ────────────────────────────────────────────────────────────────
  const cases = new Map<string, CaseFacts>();
  for (const e of ev) {
    const caseId = str(e.data?.caseId);
    if (e.kind === 'signal.raised' && caseId)
      cases.set(caseId, {
        caseId,
        openedAt: e.at,
        dueOn: str(e.data?.dueOn) ?? cairoDay(e.at),
        firstContactAt: null,
        outcomeLogged: false,
        status: 'open',
        dismissReason: null,
      });
    const c = caseId ? cases.get(caseId) : undefined;
    if (!c) continue;
    const contact = e.kind === 'case.outcome' || e.kind === 'message.sent_manually';
    if (contact && !c.firstContactAt) c.firstContactAt = e.at;
    if (e.kind === 'case.outcome') {
      c.outcomeLogged = true;
      if (e.data?.status === 'resolved') c.status = 'resolved';
    }
    if (e.kind === 'case.dismissed') {
      c.status = 'dismissed';
      c.dismissReason = str(e.data?.reason);
    }
    if (e.kind === 'case.reopened') {
      c.status = 'open';
      c.dismissReason = null;
    }
  }
  const all = [...cases.values()];
  const contactedByDue = all.filter(
    (c) => c.firstContactAt && cairoDay(c.firstContactAt) <= c.dueOn,
  );
  const dismissed = all.filter((c) => c.status === 'dismissed');

  // ── records ───────────────────────────────────────────────────────────────────
  const scheduled = world.groups.flatMap((g) =>
    sessionsOfGroup(world, g.id).filter((s) => s.date >= from && new Date(s.endsAt) <= now),
  );
  const confirmedSessions = new Set<string>();
  const endToConfirm: number[] = [];
  const bySource = { tap: 0, voice: 0, mixed: 0 };
  for (const e of ev.filter((x) => x.kind === 'record.confirmed')) {
    const sid = str(e.data?.sessionId);
    if (!sid || confirmedSessions.has(sid)) continue;
    confirmedSessions.add(sid);
    const end = str(e.data?.sessionEndsAt);
    if (end) endToConfirm.push(Math.max(0, hours(end, e.at)));
    const src = str(e.data?.source) as keyof typeof bySource | null;
    if (src && src in bySource) bySource[src]++;
  }
  const scheduledIds = new Set(scheduled.map((s) => s.id));

  // ── usage ─────────────────────────────────────────────────────────────────────
  const roleOf = new Map(world.users.map((u) => [u.id, u.role]));
  const activeByDay = new Map<string, Map<string, string>>();
  for (const e of ev) {
    if (!e.actorId || !roleOf.has(e.actorId)) continue;
    const d = cairoDay(e.at);
    const m = activeByDay.get(d) ?? new Map<string, string>();
    m.set(e.actorId, roleOf.get(e.actorId)!);
    activeByDay.set(d, m);
  }

  // ── daily ─────────────────────────────────────────────────────────────────────
  const days: string[] = [];
  for (let d = from; d <= today; d = addDay(d)) days.push(d);
  const count = (kind: string | string[], d: string) =>
    ev.filter((e) => (Array.isArray(kind) ? kind : [kind]).includes(e.kind) && cairoDay(e.at) === d)
      .length;
  const active = (d: string, r: string) =>
    [...(activeByDay.get(d)?.values() ?? [])].filter((x) => x === r).length;
  const daily: DayRow[] = days.map((d) => ({
    day: d,
    flags: count('signal.raised', d),
    contacts: count(['case.outcome', 'message.sent_manually'], d),
    outcomes: count('case.outcome', d),
    sessionsScheduled: scheduled.filter((s) => s.date === d).length,
    recordsConfirmed: count('record.confirmed', d),
    activeOwner: active(d, 'owner'),
    activeReception: active(d, 'reception'),
    activeTeacher: active(d, 'teacher'),
  }));

  return {
    from,
    to: today,
    generatedAt: now.toISOString(),
    completion: {
      flagsRaised: ev.filter((e) => e.kind === 'signal.raised').length,
      casesOpened: all.length,
      contactedByDue: { n: contactedByDue.length, of: all.length },
      outcomeLogged: { n: all.filter((c) => c.outcomeLogged).length, of: all.length },
      medianHoursFlagToContact: median(
        all.filter((c) => c.firstContactAt).map((c) => hours(c.openedAt, c.firstContactAt!)),
      ),
      dismissed: {
        n: dismissed.length,
        of: all.length,
        reasons: dismissed.map((c) => c.dismissReason ?? '—'),
      },
      openPastDue: {
        n: all.filter((c) => c.status === 'open' && c.dueOn < today).length,
        of: all.length,
      },
    },
    records: {
      sessionsScheduled: scheduled.length,
      withConfirmedRecord: {
        n: [...confirmedSessions].filter((s) => scheduledIds.has(s)).length,
        of: scheduled.length,
      },
      medianHoursEndToConfirm: median(endToConfirm),
      bySource,
    },
    usage: days.map((d) => ({
      day: d,
      owner: active(d, 'owner'),
      reception: active(d, 'reception'),
      teacher: active(d, 'teacher'),
    })),
    daily,
    cases: all,
  };
}

function addDay(d: string) {
  const [y, m, dd] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
}

const pct = ({ n, of }: { n: number; of: number }) =>
  of ? `${n} / ${of} (${Math.round((n / of) * 100)}%)` : `${n} / 0 (—)`;
const hrs = (h: number | null) =>
  h == null ? '—' : h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)} h`;

export function metricsMarkdown(m: PilotMetrics, centre: string): string {
  const c = m.completion;
  const r = m.records;
  return `# Pilot metrics — ${centre}

${m.from} to ${m.to} · generated ${m.generatedAt} · source: the append-only activity log (\`pnpm pilot:metrics\`).
Counts only, except the dismiss reasons, which are staff's own words: check them for names before sharing.

## Follow-up completion (main result)

| Measure | Value |
|---|---|
| Flags raised | ${c.flagsRaised} |
| Follow-ups opened | ${c.casesOpened} |
| Contact attempt by the due date | ${pct(c.contactedByDue)} |
| Outcome logged | ${pct(c.outcomeLogged)} |
| Median time from flag to first contact | ${hrs(c.medianHoursFlagToContact)} |
| Dismissed | ${pct(c.dismissed)} |
| Still open past due | ${pct(c.openPastDue)} |

Dismiss reasons, as staff wrote them: ${c.dismissed.reasons.length ? c.dismissed.reasons.map((x) => `"${x}"`).join('; ') : 'none'}.

## Record keeping

| Measure | Value |
|---|---|
| Sessions scheduled (and past) | ${r.sessionsScheduled} |
| With a confirmed record | ${pct(r.withConfirmedRecord)} |
| Median time from session end to confirmation | ${hrs(r.medianHoursEndToConfirm)} |
| Entered by tap / voice / both | ${r.bySource.tap} / ${r.bySource.voice} / ${r.bySource.mixed} |

## Usage — people active per day, by role

| Day | Owner | Reception | Teacher |
|---|---|---|---|
${m.usage.map((u) => `| ${u.day} | ${u.owner} | ${u.reception} | ${u.teacher} |`).join('\n')}

## Daily breakdown

| Day | Sessions | Records confirmed | Flags | Contacts | Outcomes |
|---|---|---|---|---|---|
${m.daily.map((d) => `| ${d.day} | ${d.sessionsScheduled} | ${d.recordsConfirmed} | ${d.flags} | ${d.contacts} | ${d.outcomes} |`).join('\n')}

## Caveats — read before quoting any number

- **Small sample.** One centre, a few groups, ${m.daily.length} days. Percentages move a lot with one case; quote the counts.
- **Novelty effect.** Staff try harder with a new tool in its first week.
- **We were there.** Our presence at the centre (and the daily check-in) can raise completion.
- **"Scheduled" is not "held".** A cancelled session counts as scheduled and shows as having no record.
- **Contact means a logged attempt**, not a reached family: a WhatsApp message sent by hand counts as contact.
- **Days are Cairo days**; "by the due date" means on or before the due date, Cairo time.
`;
}

export function metricsCsv(m: PilotMetrics): string {
  const head =
    'day,sessions_scheduled,records_confirmed,flags,contacts,outcomes,active_owner,active_reception,active_teacher';
  return (
    [
      head,
      ...m.daily.map((d) =>
        [
          d.day,
          d.sessionsScheduled,
          d.recordsConfirmed,
          d.flags,
          d.contacts,
          d.outcomes,
          d.activeOwner,
          d.activeReception,
          d.activeTeacher,
        ].join(','),
      ),
    ].join('\n') + '\n'
  );
}
