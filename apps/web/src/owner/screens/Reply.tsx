'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fuApi, ownerApi, type InboundMessage } from '@link/api-client';
import { formatTime } from '@link/i18n';
import { Avatar, Button, Callout, Card, Checkbox, Logo } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, useCentre } from '../common';

type Step = InboundMessage['suggestions'][number];

/**
 * V06 · Parent replied (FUP-MSG-05): the reply, a short summary and its intent, and suggested next
 * steps. Nothing is pre-ticked and nothing happens on its own: every step is a staff action, and
 * suggestions never close a case.
 */
export function OwnerReply({ caseId }: { caseId: string }) {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const router = useRouter();
  const qc = useQueryClient();
  const messageId = useSearchParams().get('message') ?? '';
  const q = useQuery({
    queryKey: ['message', messageId, locale],
    queryFn: () => fuApi.message(messageId),
    enabled: !!messageId,
  });
  const [picked, setPicked] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [seat, setSeat] = useState<string | null>(null);

  const label: Record<Step, { title: string; detail: string }> = {
    record_outcome: {
      title: t('owner.reply.stepOutcome'),
      detail: t('owner.reply.stepOutcomeDetail'),
    },
    check_seat: { title: t('owner.reply.stepSeat'), detail: t('owner.reply.stepSeatDetail') },
    draft_reply: { title: t('owner.reply.stepDraft'), detail: t('owner.reply.stepDraftDetail') },
  };

  async function apply(reply: InboundMessage) {
    setBusy(true);
    try {
      if (picked.includes('check_seat')) setSeat((await ownerApi.seatCheck(caseId)).text);
      let draftId: string | null = null;
      if (picked.includes('draft_reply')) draftId = (await fuApi.draftMessage(caseId)).id;
      await qc.invalidateQueries();
      if (picked.includes('record_outcome'))
        router.push(
          `${base}/follow-ups/${caseId}/outcome?learned=${encodeURIComponent(reply.summary)}`,
        );
      else if (draftId) router.push(`${base}/messages/${draftId}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <QueryState query={q}>
      {(m) => {
        const reply = m.replies.at(-1);
        if (!reply) return <Callout tone="info">{t('owner.reply.none')}</Callout>;
        return (
          <>
            <OwnerPageHeader
              back={{ href: `${base}/follow-ups/${caseId}`, label: t('owner.msg.backToCase') }}
              title={t('owner.reply.title', { name: m.guardian.displayName })}
              subtitle={`${m.student.displayName} • ${formatTime(reply.receivedAt, locale)}`}
            />
            <div className="grid max-w-3xl grid-cols-1 gap-4">
              <Card className="flex flex-col gap-2" data-testid="reply-body">
                <div className="flex items-center gap-3">
                  <Avatar name={m.guardian.displayName} size="sm" tone="green" />
                  <p className="text-label text-navy">{t('owner.reply.guardianReply')}</p>
                </div>
                <p dir="rtl" lang="ar" className="text-body text-navy">
                  {reply.body}
                </p>
              </Card>
              <div
                className="flex flex-col gap-2 rounded-16 bg-navy p-5 text-white"
                data-testid="reply-summary"
              >
                <div className="flex items-center gap-2">
                  <Logo variant="mark" size={24} label="" />
                  <p className="text-label">{t('owner.reply.summary')}</p>
                </div>
                <p className="text-body">{reply.summary}</p>
                <p className="text-caption">
                  {t('owner.reply.intent')}: {reply.intent}
                </p>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="pb-2 text-caption uppercase text-muted">
                  {t('owner.reply.suggested')}
                </legend>
                {reply.suggestions.map((s) => (
                  <Card key={s} className="flex flex-col gap-1">
                    <Checkbox
                      id={`step-${s}`}
                      checked={picked.includes(s)}
                      onCheckedChange={(on) =>
                        setPicked((p) => (on ? [...p, s] : p.filter((x) => x !== s)))
                      }
                      description={label[s].detail}
                    >
                      {label[s].title}
                    </Checkbox>
                  </Card>
                ))}
              </fieldset>
              {seat ? (
                <Callout tone="info" role="status" title={t('owner.reply.seatResult')}>
                  {seat}
                </Callout>
              ) : null}
              <Button
                data-testid="apply-steps"
                disabled={!picked.length || busy}
                onClick={() => apply(reply)}
              >
                {t('owner.reply.apply', { count: picked.length })}
              </Button>
              <p className="text-caption text-muted">{t('owner.reply.neverClose')}</p>
            </div>
          </>
        );
      }}
    </QueryState>
  );
}
