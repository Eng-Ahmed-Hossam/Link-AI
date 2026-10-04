'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fuApi } from '@link/api-client';
import { formatTime } from '@link/i18n';
import { Button, Callout, Card, EvidenceList, StatusBadge, Textarea } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import {
  OwnerPageHeader,
  caseStatus,
  dateTime,
  dayMonth,
  messageStatus,
  num,
  useCentre,
} from '../common';

/**
 * A03 · Follow-up case (FUP-CAS-02, FUP-CAS-04). "Why this appeared" (rule, dates, who confirmed),
 * "Rule used", context and the append-only timeline. Default assignee and same-day due come from
 * the rule. Dismissing needs a reason; the flag stays in history and can be reopened.
 */
export function OwnerCase({ caseId }: { caseId: string }) {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['case', caseId, locale], queryFn: () => fuApi.case(caseId) });
  const msgs = useQuery({ queryKey: ['messages', locale], queryFn: () => fuApi.messages() });
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries();
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.problem.detail ?? t('states.error.body'))
          : t('states.error.body'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <QueryState query={q} loadingRows={4}>
      {(c) => {
        const st = caseStatus(t, c);
        const caseMsgs = (msgs.data?.data ?? []).filter((m) => m.caseId === c.id);
        const draft = caseMsgs.find((m) => m.status === 'draft');
        const replied = caseMsgs.find((m) => m.replies.length);
        const closed = c.status === 'dismissed' || c.status === 'resolved';
        const confirmers = [
          ...new Set(c.signal.evidence.map((e) => e.confirmedBy.displayName)),
        ].join('، ');
        return (
          <>
            <OwnerPageHeader
              back={{ href: `${base}/follow-ups`, label: t('owner.nav.followUps') }}
              title={t('owner.case.title', { name: c.student.displayName })}
              subtitle={`${c.signal.group.name} • ${t('owner.case.fromRecords')}`}
              actions={<StatusBadge tone={st.tone}>{st.label}</StatusBadge>}
            />
            {c.status === 'dismissed' ? (
              <Callout tone="neutral" title={t('owner.case.dismissedTitle')} role="status">
                «{c.dismissReason}» — {t('owner.case.dismissedBody')}
              </Callout>
            ) : null}
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
              <Card className="flex flex-col gap-4">
                <h2 className="text-heading text-navy">{t('owner.case.why')}</h2>
                <div className="flex flex-col gap-1">
                  <p className="text-label text-navy">{c.signal.explanation}</p>
                  <p className="text-body text-muted">
                    {t('owner.case.confirmedBy', { names: confirmers })}
                  </p>
                </div>
                <EvidenceList
                  label={t('owner.case.evidence')}
                  items={c.signal.evidence.map((e) => ({
                    id: e.recordId,
                    fact: t('owner.case.evidenceFact', { date: dayMonth(e.sessionDate, locale) }),
                    source: (
                      <Link href={`${base}/sessions/${e.recordId}`} className="text-blueText">
                        {t('owner.case.evidenceSource', { name: e.confirmedBy.displayName })}
                      </Link>
                    ),
                  }))}
                />
                <div className="flex flex-col gap-1">
                  <p className="text-label text-navy">
                    {t('owner.case.ruleUsed', { v: num(c.signal.ruleVersion, locale) })}
                  </p>
                  <p className="text-body text-muted">{c.signal.ruleText}</p>
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-label text-navy">{t('owner.case.context')}</p>
                  <p className="text-body text-muted">{t('owner.case.contextBody')}</p>
                </div>
                <h2 className="text-heading text-navy">{t('owner.case.activity')}</h2>
                <ol className="flex flex-col gap-3" aria-label={t('owner.case.activity')}>
                  {[...c.timeline].reverse().map((e, i) => (
                    <li key={i} className="flex flex-col">
                      <span className="text-label text-navy">
                        {dateTime(e.at, locale)}
                        {e.actor ? ` • ${e.actor.displayName}` : ` • ${t('owner.case.system')}`}
                      </span>
                      <span className="text-body text-muted">{e.text}</span>
                    </li>
                  ))}
                </ol>
                <Link
                  href={`${base}/students/${c.student.id}`}
                  className="inline-flex min-h-11 items-center self-start rounded-12 border border-border px-5 text-label text-navy"
                >
                  {t('owner.case.openStudent')}
                </Link>
              </Card>

              <Card className="flex flex-col gap-4 self-start">
                <h2 className="text-heading text-navy">{t('owner.case.nextAction')}</h2>
                <dl className="flex flex-col gap-3">
                  <div>
                    <dt className="text-caption text-muted">{t('owner.case.assignedTo')}</dt>
                    <dd className="text-label text-navy" data-testid="case-assignee">
                      {c.assignee.displayName} ({c.assignee.role})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-caption text-muted">{t('owner.case.dueDate')}</dt>
                    <dd className="text-label text-navy" data-testid="case-due">
                      {dayMonth(c.dueOn, locale)}
                      {c.overdue ? ` • ${t('owner.case.status.overdue')}` : ''}
                    </dd>
                  </div>
                </dl>
                {caseMsgs.map((m) => {
                  const ms = messageStatus(t, m.status);
                  return (
                    <Link
                      key={m.id}
                      href={`${base}/messages/${m.id}`}
                      className="flex min-h-11 items-center justify-between gap-2 rounded-12 bg-soft px-3"
                    >
                      <span className="text-label text-navy">{t('owner.case.message')}</span>
                      <StatusBadge tone={ms.tone}>{ms.label}</StatusBadge>
                    </Link>
                  );
                })}
                {replied ? (
                  <Link
                    href={`${base}/follow-ups/${c.id}/reply?message=${replied.id}`}
                    className="inline-flex min-h-11 items-center rounded-12 bg-blueSoft px-4 text-label text-blueText"
                    data-testid="open-reply"
                  >
                    {t('owner.case.parentReplied', {
                      time: formatTime(replied.replies.at(-1)!.receivedAt, locale),
                    })}
                  </Link>
                ) : null}
                {!closed ? (
                  <>
                    <Button
                      data-testid="draft-message"
                      disabled={busy}
                      onClick={() =>
                        draft
                          ? router.push(`${base}/messages/${draft.id}`)
                          : run(async () => {
                              const m = await fuApi.draftMessage(c.id);
                              router.push(`${base}/messages/${m.id}`);
                            })
                      }
                    >
                      {draft ? t('owner.case.openDraft') : t('owner.case.draftMessage')}
                    </Button>
                    <Link
                      href={`${base}/follow-ups/${c.id}/outcome`}
                      data-testid="record-outcome"
                      className="inline-flex min-h-11 items-center justify-center rounded-12 border border-border px-5 text-label text-navy"
                    >
                      {t('owner.case.recordOutcome')}
                    </Link>
                    {dismissing ? (
                      <div className="flex flex-col gap-2">
                        <Textarea
                          label={t('owner.case.dismissReason')}
                          value={reason}
                          maxLength={300}
                          onChange={(e) => setReason(e.target.value)}
                          counter={(n, max) => t('common.counter', { n, max })}
                          data-testid="dismiss-reason"
                        />
                        <Button
                          variant="secondary"
                          danger
                          data-testid="confirm-dismiss"
                          disabled={busy || !reason.trim()}
                          onClick={() => run(() => fuApi.dismissCase(c.id, reason.trim()))}
                        >
                          {t('owner.case.confirmDismiss')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="quiet"
                        data-testid="dismiss"
                        onClick={() => setDismissing(true)}
                      >
                        {t('owner.case.dismiss')}
                      </Button>
                    )}
                  </>
                ) : c.status === 'dismissed' ? (
                  <Button
                    variant="secondary"
                    data-testid="reopen"
                    disabled={busy}
                    onClick={() => run(() => fuApi.reopenCase(c.id))}
                  >
                    {t('owner.case.reopen')}
                  </Button>
                ) : null}
                {error ? (
                  <Callout tone="error" role="alert">
                    {error}
                  </Callout>
                ) : null}
              </Card>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
