'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fuApi, type CaseAttempt } from '@link/api-client';
import { Button, Callout, Card, Checkbox, Input, Select, StatusBadge, Textarea } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { PILOT } from '../../api-mode';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, caseStatus, dayMonth, useCentre } from '../common';

/**
 * A08 · Record the outcome (FUP-CAS-03). Contact method, result, what you learned, next action and
 * follow-up date. "Keep open until confirmed" is on by default: a contact attempt is not a
 * resolution (BR-APR-10).
 */
export function OwnerOutcome({ caseId }: { caseId: string }) {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const prefill = params.get('learned') ?? '';
  const q = useQuery({ queryKey: ['case', caseId, locale], queryFn: () => fuApi.case(caseId) });
  // Pilot "Log the guardian's reply" opens this form on the reply (method and result filled in).
  const [channel, setChannel] = useState<CaseAttempt['channel'] | ''>(
    (params.get('method') as CaseAttempt['channel'] | null) ?? '',
  );
  const [result, setResult] = useState<CaseAttempt['result'] | ''>(
    (params.get('result') as CaseAttempt['result'] | null) ?? '',
  );
  const [learned, setLearned] = useState(prefill);
  const [nextAction, setNextAction] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  const [keepOpen, setKeepOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!channel || !result) {
      setError(t('owner.outcome.needMethodAndResult'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fuApi.addAttempt(caseId, {
        channel,
        result,
        learned: learned.trim() || null,
        nextAction: nextAction.trim() || null,
        followUpOn: followUpOn || null,
        keepOpen,
      });
      await qc.invalidateQueries();
      router.push(`${base}/follow-ups/${caseId}/outcome/done`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.problem.detail ?? t('states.error.body'))
          : t('states.error.body'),
      );
      setBusy(false);
    }
  }

  return (
    <QueryState query={q}>
      {(c) => (
        <>
          <OwnerPageHeader
            back={{ href: `${base}/follow-ups/${c.id}`, label: t('owner.msg.backToCase') }}
            title={t('owner.outcome.title')}
            subtitle={`${c.student.displayName} • ${t('owner.outcome.notResolution')}`}
          />
          <Card className="flex max-w-4xl flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Select
                label={t('owner.outcome.method')}
                placeholder={t('owner.outcome.choose')}
                value={channel}
                onChange={(e) => setChannel(e.target.value as CaseAttempt['channel'])}
                options={[
                  { value: 'phone', label: t('owner.outcome.phone') },
                  PILOT
                    ? { value: 'whatsapp_manual', label: t('owner.outcome.whatsappManual') }
                    : { value: 'whatsapp', label: t('owner.outcome.whatsapp') },
                  { value: 'sms', label: t('owner.outcome.sms') },
                  { value: 'meeting', label: t('owner.outcome.meeting') },
                ]}
                data-testid="outcome-method"
              />
              <Select
                label={t('owner.outcome.result')}
                placeholder={t('owner.outcome.choose')}
                value={result}
                onChange={(e) => setResult(e.target.value as CaseAttempt['result'])}
                options={[
                  { value: 'reached', label: t('owner.outcome.reached') },
                  { value: 'no_answer', label: t('owner.outcome.noAnswer') },
                  { value: 'wrong_number', label: t('owner.outcome.wrongNumber') },
                  { value: 'replied', label: t('owner.outcome.replied') },
                ]}
                data-testid="outcome-result"
              />
            </div>
            <Textarea
              label={t('owner.outcome.learned')}
              value={learned}
              maxLength={500}
              onChange={(e) => setLearned(e.target.value)}
              counter={(n, max) => t('common.counter', { n, max })}
              data-testid="outcome-learned"
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Input
                label={t('owner.outcome.nextAction')}
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                data-testid="outcome-next"
              />
              <Input
                label={t('owner.outcome.followUpOn')}
                type="date"
                value={followUpOn}
                onChange={(e) => setFollowUpOn(e.target.value)}
                data-testid="outcome-date"
              />
            </div>
            <Checkbox
              id="keep-open"
              checked={keepOpen}
              onCheckedChange={setKeepOpen}
              description={t('owner.outcome.keepOpenBody')}
            >
              {t('owner.outcome.keepOpen')}
            </Checkbox>
            <Callout tone="info" title={t('owner.outcome.notResolutionTitle')}>
              {t('owner.outcome.notResolutionBody')}
            </Callout>
            {error ? (
              <Callout tone="error" role="alert">
                {error}
              </Callout>
            ) : null}
            <Button
              data-testid="save-outcome"
              disabled={busy}
              onClick={save}
              className="self-start"
            >
              {t('owner.outcome.save')}
            </Button>
          </Card>
        </>
      )}
    </QueryState>
  );
}

/** A10 · Outcome recorded (FUP-CAS-03 AC3): "Contact recorded. Next step set." + outcome history. */
export function OwnerOutcomeDone({ caseId }: { caseId: string }) {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const q = useQuery({ queryKey: ['case', caseId, locale], queryFn: () => fuApi.case(caseId) });
  const channel: Record<CaseAttempt['channel'], string> = {
    phone: t('owner.outcome.phone'),
    whatsapp: t('owner.outcome.whatsapp'),
    whatsapp_manual: t('owner.outcome.whatsappManual'),
    sms: t('owner.outcome.sms'),
    meeting: t('owner.outcome.meeting'),
  };
  const result: Record<CaseAttempt['result'], string> = {
    reached: t('owner.outcome.reached'),
    no_answer: t('owner.outcome.noAnswer'),
    wrong_number: t('owner.outcome.wrongNumber'),
    message_sent: t('owner.outcome.messageSent'),
    replied: t('owner.outcome.replied'),
  };
  return (
    <QueryState query={q}>
      {(c) => {
        const st = caseStatus(t, c);
        const last = c.attempts.at(-1);
        return (
          <>
            <OwnerPageHeader
              title={t('owner.outcome.doneTitle')}
              subtitle={c.student.displayName}
              actions={<StatusBadge tone={st.tone}>{st.label}</StatusBadge>}
            />
            {c.status === 'awaiting_confirmation' ? (
              <Callout
                tone="success"
                title={t('owner.case.status.awaiting_confirmation')}
                role="status"
              >
                {t('owner.outcome.awaitingBody')}
              </Callout>
            ) : null}
            <Card className="flex max-w-4xl flex-col gap-3">
              {last?.nextAction || last?.followUpOn ? (
                <div>
                  <p className="text-label text-navy">
                    {c.assignee.role}
                    {last.followUpOn ? ` • ${dayMonth(last.followUpOn, locale)}` : ''}
                  </p>
                  <p className="text-body text-muted">{last.nextAction}</p>
                </div>
              ) : null}
              <h2 className="text-label text-navy">{t('owner.outcome.history')}</h2>
              <ol className="flex flex-col gap-2" data-testid="outcome-history">
                {c.attempts.map((a) => (
                  <li key={a.id} className="text-body text-muted">
                    {dayMonth(a.at.slice(0, 10), locale)} • {channel[a.channel]} •{' '}
                    {result[a.result]}
                    {a.learned ? ` — ${a.learned}` : ''}
                  </li>
                ))}
              </ol>
              <Link
                href={`${base}/follow-ups`}
                className="inline-flex min-h-11 items-center justify-center self-start rounded-12 bg-blue px-5 text-label text-navy"
              >
                {t('owner.outcome.back')}
              </Link>
            </Card>
          </>
        );
      }}
    </QueryState>
  );
}
