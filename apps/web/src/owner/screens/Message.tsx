'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, fuApi, ownerApi, type ParentMessage } from '@link/api-client';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Checkbox,
  EvidenceList,
  Segmented,
  StatusBadge,
  Textarea,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { PILOT } from '../../api-mode';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dateTime, messageStatus, useCentre } from '../common';

/**
 * A06 + V04 · Review & approve the parent message (FUP-MSG-01, FUP-MSG-02), then A09 · the approved
 * message (FUP-MSG-03). The draft uses confirmed facts only, each with its source; tone is a choice;
 * the text is freely editable; the phone is masked. Approval needs the tick and `messages.approve`.
 * An approved message is locked — changing it starts a new draft. Delivery status comes only from
 * the provider.
 *
 * Pilot (A6): Link sends nothing. After approval staff copy the text, send it from the centre's own
 * WhatsApp and press "I sent it" — a contact attempt by them, never "Delivered" or "Read".
 */
export function OwnerMessage({ messageId }: { messageId: string }) {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const q = useQuery({
    queryKey: ['message', messageId, locale],
    queryFn: () => fuApi.message(messageId),
    // Provider events arrive on their own: keep the status fresh (never cached, BR-APR-11).
    refetchInterval: (query) =>
      query.state.data && query.state.data.status !== 'draft' ? 2000 : false,
  });
  return (
    <QueryState query={q} loadingRows={4}>
      {(m) =>
        m.status === 'draft' ? (
          <Review m={m} base={base} />
        ) : (
          <Approved m={m} base={base} locale={locale} t={t} />
        )
      }
    </QueryState>
  );
}

function Recipient({ m }: { m: ParentMessage }) {
  const { t } = useI18n();
  const g = m.guardian;
  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-16 border border-border p-4"
      data-testid="recipient"
    >
      <Avatar name={g.displayName} tone="green" />
      <div className="min-w-0 flex-1">
        <p className="text-label text-navy">
          <bdi>{g.displayName}</bdi>
        </p>
        <p className="text-caption text-muted">
          {t('owner.msg.guardianOf', { name: m.student.displayName })} •{' '}
          {PILOT ? (
            t('owner.pilot.phoneKept')
          ) : (
            <bdi dir="ltr" data-testid="masked-phone">
              {g.phoneMasked}
            </bdi>
          )}
        </p>
      </div>
      {PILOT ? (
        <StatusBadge tone="info">{t('owner.pilot.sendFromCentre')}</StatusBadge>
      ) : g.stopped ? (
        <StatusBadge tone="error">{t('owner.msg.stopped')}</StatusBadge>
      ) : g.whatsappOptIn ? (
        <StatusBadge tone="success">{t('owner.msg.optedIn')}</StatusBadge>
      ) : (
        <StatusBadge tone="warning">{t('owner.msg.notOptedIn')}</StatusBadge>
      )}
    </div>
  );
}

function Grounded({ m }: { m: ParentMessage }) {
  const { t } = useI18n();
  return (
    <Card className="flex flex-col gap-3 self-start" data-testid="grounded">
      <h2 className="text-heading text-navy">{t('owner.msg.grounded')}</h2>
      <EvidenceList
        label={t('owner.msg.grounded')}
        items={m.groundedFacts.map((f) => ({ id: f.recordId, fact: f.text, source: f.source }))}
      />
      <Callout tone="info" title={t('owner.msg.internalTitle')}>
        {t('owner.msg.internalBody')}
      </Callout>
    </Card>
  );
}

function Review({ m, base }: { m: ParentMessage; base: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const qc = useQueryClient();
  const [text, setText] = useState(m.draft);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => setText(m.draft), [m.draft]);
  // Pilot: the centre sends from its own WhatsApp, so Link's opt-in state does not apply (A6).
  const blocked =
    !PILOT && (m.guardian.stopped || (!m.guardian.whatsappOptIn && !m.guardian.smsConsent));
  const smsOnly =
    !PILOT && !m.guardian.stopped && !m.guardian.whatsappOptIn && m.guardian.smsConsent;

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
    <>
      <OwnerPageHeader
        back={
          m.caseId
            ? { href: `${base}/follow-ups/${m.caseId}`, label: t('owner.msg.backToCase') }
            : undefined
        }
        title={t('owner.msg.reviewTitle')}
        subtitle={`${m.student.displayName} • ${m.purpose}`}
        actions={<StatusBadge tone="warning">{t('owner.msg.status.draft')}</StatusBadge>}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="flex flex-col gap-4">
          <Recipient m={m} />
          {PILOT ? null : m.guardian.stopped ? (
            <Callout tone="error" title={t('owner.msg.cantSendTitle')} role="alert">
              {t('owner.msg.cantSendStopped')}
            </Callout>
          ) : !m.guardian.whatsappOptIn ? (
            <Callout tone="warning" title={t('owner.msg.cantSendTitle')} role="alert">
              {m.guardian.smsConsent ? t('owner.msg.smsOffered') : t('owner.msg.cantSendNoConsent')}
            </Callout>
          ) : null}
          <Segmented
            label={t('owner.msg.tone')}
            value={m.tone}
            onValueChange={(v) =>
              run(() => fuApi.editMessage(m.id, { tone: v as ParentMessage['tone'] }))
            }
            options={[
              { value: 'warm', label: t('owner.msg.toneWarm') },
              { value: 'neutral', label: t('owner.msg.toneNeutral') },
              { value: 'formal', label: t('owner.msg.toneFormal') },
            ]}
          />
          <div lang="ar" dir="rtl">
            <Textarea
              label={t('owner.msg.text')}
              value={text}
              maxLength={1000}
              onChange={(e) => {
                setText(e.target.value);
                setSaved(false);
              }}
              counter={(n, max) => t('common.counter', { n, max })}
              data-testid="message-text"
            />
          </div>
          <Checkbox checked={checked} onCheckedChange={setChecked} id="checked-facts">
            {t('owner.msg.checked')}
          </Checkbox>
          <div className="flex flex-wrap gap-3">
            <Button
              data-testid="approve"
              disabled={!checked || busy || blocked}
              onClick={() =>
                run(async () => {
                  if (text !== m.draft) await fuApi.editMessage(m.id, { text });
                  await fuApi.approveMessage(
                    m.id,
                    PILOT
                      ? { checked: true }
                      : { checked: true, channel: smsOnly ? 'sms' : 'whatsapp' },
                  );
                })
              }
            >
              {smsOnly ? t('owner.msg.approveSms') : t('owner.msg.approve')}
            </Button>
            <Button
              variant="secondary"
              disabled={busy || text === m.draft}
              onClick={() =>
                run(async () => (await fuApi.editMessage(m.id, { text }), setSaved(true)))
              }
            >
              {t('owner.msg.saveDraft')}
            </Button>
          </div>
          {saved ? (
            <p className="text-caption text-muted" role="status">
              {t('owner.msg.saved')}
            </p>
          ) : null}
          <p className="text-caption text-muted">{t('owner.msg.onlyApproved')}</p>
          {error ? (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          ) : null}
          {m.caseId ? (
            <Button variant="quiet" onClick={() => router.push(`${base}/follow-ups/${m.caseId}`)}>
              {t('owner.msg.backToCase')}
            </Button>
          ) : null}
        </Card>
        <Grounded m={m} />
      </div>
    </>
  );
}

function Approved({
  m,
  base,
  locale,
  t,
}: {
  m: ParentMessage;
  base: string;
  locale: 'ar' | 'en';
  t: ReturnType<typeof useI18n>['t'];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const st = messageStatus(t, m.status);
  const [busy, setBusy] = useState(false);
  if (PILOT) return <ApprovedPilot m={m} base={base} locale={locale} t={t} />;
  return (
    <>
      <OwnerPageHeader
        back={
          m.caseId
            ? { href: `${base}/follow-ups/${m.caseId}`, label: t('owner.msg.backToCase') }
            : undefined
        }
        title={
          m.status === 'not_sendable' ? t('owner.msg.notSentTitle') : t('owner.msg.approvedTitle')
        }
        subtitle={`${m.student.displayName} • ${m.purpose}`}
        actions={
          <span data-testid="delivery-status">
            <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="flex flex-col gap-4">
          <Recipient m={m} />
          <StatusBadge tone="neutral" className="self-start">
            {t('owner.msg.locked')}
          </StatusBadge>
          <p dir="rtl" lang="ar" className="text-body text-navy" data-testid="final-text">
            {m.finalText}
          </p>
          {m.status === 'not_sendable' ? (
            <Callout tone="error" title={t('owner.msg.cantSendTitle')} role="alert">
              {m.guardian.stopped
                ? t('owner.msg.cantSendStopped')
                : t('owner.msg.cantSendNoConsent')}
            </Callout>
          ) : m.status === 'failed' ? (
            // 11 §4 "Delivery failed".
            <Callout tone="error" title={t('owner.msg.failedTitle')} role="alert">
              {t('owner.msg.failedBody')}
            </Callout>
          ) : (
            <Callout tone="info" title={t('owner.msg.notSolvingTitle')}>
              {t('owner.msg.notSolvingBody')}
            </Callout>
          )}
          <div className="flex flex-col gap-2">
            <h2 className="text-label text-navy">{t('owner.msg.history')}</h2>
            <ol className="flex flex-col gap-1" data-testid="status-history">
              {m.history.map((h, i) => (
                <li key={i} className="text-body text-muted">
                  {dateTime(h.at, locale)} — {messageStatus(t, h.status).label}
                </li>
              ))}
            </ol>
            <p className="text-caption text-muted">{t('owner.msg.providerOnly')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {m.caseId ? (
              <Link
                href={`${base}/follow-ups/${m.caseId}`}
                className="inline-flex min-h-11 items-center rounded-12 border border-border px-5 text-label text-navy"
              >
                {t('owner.msg.backToCase')}
              </Link>
            ) : null}
            <Button
              variant="secondary"
              data-testid="revise"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const n = await ownerApi.reviseMessage(m.id);
                await qc.invalidateQueries();
                router.push(`${base}/messages/${n.id}`);
              }}
            >
              {t('owner.msg.revise')}
            </Button>
          </div>
        </Card>
        <Grounded m={m} />
      </div>
    </>
  );
}

/** Pilot A09: copy, send from the centre's WhatsApp, say so; then log the reply as an outcome. */
function ApprovedPilot({
  m,
  base,
  locale,
  t,
}: {
  m: ParentMessage;
  base: string;
  locale: 'ar' | 'en';
  t: ReturnType<typeof useI18n>['t'];
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sent = m.sentManually;
  const label = sent
    ? t('owner.pilot.sentBy', { name: sent.by.displayName })
    : t('owner.pilot.notSentYet');
  async function markSent() {
    setBusy(true);
    setError(null);
    try {
      await fuApi.markSentManually(m.id);
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
    <>
      <OwnerPageHeader
        back={
          m.caseId
            ? { href: `${base}/follow-ups/${m.caseId}`, label: t('owner.msg.backToCase') }
            : undefined
        }
        title={t('owner.msg.approvedTitle')}
        subtitle={`${m.student.displayName} • ${m.purpose}`}
        actions={
          <span data-testid="delivery-status">
            <StatusBadge tone={sent ? 'success' : 'info'}>{label}</StatusBadge>
          </span>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="flex flex-col gap-4">
          <Recipient m={m} />
          <StatusBadge tone="neutral" className="self-start">
            {t('owner.msg.locked')}
          </StatusBadge>
          <p dir="rtl" lang="ar" className="text-body text-navy" data-testid="final-text">
            {m.finalText}
          </p>
          {!sent ? (
            <Callout tone="info" title={t('owner.pilot.howTitle')}>
              {t('owner.pilot.howBody')}
            </Callout>
          ) : (
            <Callout tone="info" title={t('owner.msg.notSolvingTitle')}>
              {t('owner.msg.notSolvingBody')}
            </Callout>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              variant={sent ? 'secondary' : 'primary'}
              data-testid="copy-message"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(m.finalText ?? '');
                  setCopied(true);
                } catch {
                  setError(t('owner.pilot.copyFailed'));
                }
              }}
            >
              {t('owner.pilot.copy')}
            </Button>
            {!sent ? (
              <Button data-testid="mark-sent" disabled={busy} onClick={markSent}>
                {t('owner.pilot.iSentIt')}
              </Button>
            ) : m.caseId ? (
              <Link
                href={`${base}/follow-ups/${m.caseId}/outcome?method=whatsapp_manual&result=replied`}
                data-testid="log-reply"
                className="inline-flex min-h-11 items-center rounded-12 bg-blue px-5 text-label text-navy"
              >
                {t('owner.pilot.logReply')}
              </Link>
            ) : null}
          </div>
          {copied ? (
            <p className="text-caption text-muted" role="status">
              {t('owner.pilot.copied')}
            </p>
          ) : null}
          {error ? (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          ) : null}
          <div className="flex flex-col gap-2">
            <h2 className="text-label text-navy">{t('owner.msg.history')}</h2>
            <ol className="flex flex-col gap-1" data-testid="status-history">
              {m.history.map((h, i) => (
                <li key={i} className="text-body text-muted">
                  {dateTime(h.at, locale)} — {messageStatus(t, h.status).label}
                </li>
              ))}
              {sent ? (
                <li className="text-body text-muted">
                  {t('owner.pilot.sentLine', {
                    time: dateTime(sent.at, locale),
                    name: sent.by.displayName,
                  })}
                </li>
              ) : null}
            </ol>
            <p className="text-caption text-muted">{t('owner.pilot.noReceipt')}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {m.caseId ? (
              <Link
                href={`${base}/follow-ups/${m.caseId}`}
                className="inline-flex min-h-11 items-center rounded-12 border border-border px-5 text-label text-navy"
              >
                {t('owner.msg.backToCase')}
              </Link>
            ) : null}
            <Button
              variant="secondary"
              data-testid="revise"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const n = await ownerApi.reviseMessage(m.id);
                await qc.invalidateQueries();
                router.push(`${base}/messages/${n.id}`);
              }}
            >
              {t('owner.msg.revise')}
            </Button>
          </div>
        </Card>
        <Grounded m={m} />
      </div>
    </>
  );
}
