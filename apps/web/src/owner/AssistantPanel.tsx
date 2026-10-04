'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, ownerApi, type AssistantEvent, type AssistantTier } from '@link/api-client';
import { Button, Callout, Chip, Logo, StatusBadge } from '@link/ui';
import { useI18n } from '../i18n-client';
import { messageStatus, useCentre } from './common';

interface Turn {
  id: number;
  user: string;
  text: string;
  tier: AssistantTier | null;
  cards: Exclude<AssistantEvent, { type: 'token' } | { type: 'tier' } | { type: 'done' }>[];
  done: boolean;
}

/**
 * V07 / V03 · Ask Link (FUP-DSH-05). Text or Arabic voice; the answer streams (SSE). The assistant
 * acts as the signed-in user: Read answers, Draft creates a draft for approval, Act always needs a
 * person's approval. "Link only drafts. Every message to a parent needs your approval."
 */
export function AssistantPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const qc = useQueryClient();
  const brief = useQuery({
    queryKey: ['assistant-briefing', locale],
    queryFn: ownerApi.briefing,
    enabled: open,
    refetchInterval: open ? 4000 : false,
  });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const rec = useRef<MediaRecorder | null>(null);
  const seq = useRef(0);
  // Read by the recorder's onstop, which outlives the render that created it.
  const busyRef = useRef(false);

  if (!open) return null;

  async function ask(q: string) {
    const ask = q.trim();
    if (!ask || busyRef.current) return;
    const id = ++seq.current;
    setTurns((ts) => [...ts, { id, user: ask, text: '', tier: null, cards: [], done: false }]);
    setText('');
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const patch = (fn: (x: Turn) => Turn) =>
      setTurns((ts) => ts.map((x) => (x.id === id ? fn(x) : x)));
    try {
      await ownerApi.assistantTurn(ask, (e) => {
        if (e.type === 'token') patch((x) => ({ ...x, text: x.text + e.text }));
        else if (e.type === 'tier') patch((x) => ({ ...x, tier: e.tier }));
        else if (e.type === 'done') patch((x) => ({ ...x, done: true }));
        else patch((x) => ({ ...x, cards: [...x.cards, e] }));
      });
      await qc.invalidateQueries();
    } catch (e) {
      setError(
        e instanceof ApiError && e.isNetwork ? t('states.offline.body') : t('states.error.body'),
      );
      patch((x) => ({ ...x, done: true }));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function startVoice() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((tr) => tr.stop());
        try {
          const { text: heard } = await ownerApi.transcribe(new Blob(chunks, { type: r.mimeType }));
          // A turn still streaming: keep what was heard in the input rather than dropping it.
          if (busyRef.current) setText(heard);
          else await ask(heard);
        } catch {
          setError(t('owner.assistant.voiceFailed'));
        }
      };
      r.start();
      rec.current = r;
      setRecording(true);
    } catch {
      setError(t('owner.assistant.micOff'));
    }
  }
  function stopVoice() {
    rec.current?.stop();
    rec.current = null;
    setRecording(false);
  }

  const tierLabel = (tier: AssistantTier) =>
    tier === 'read'
      ? t('owner.assistant.tierRead')
      : tier === 'draft'
        ? t('owner.assistant.tierDraft')
        : t('owner.assistant.tierAct');

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={t('owner.assistant.title')}
      data-testid="assistant-panel"
      className="fixed inset-y-0 end-0 z-40 flex w-full max-w-[440px] flex-col gap-4 overflow-y-auto border-s border-border bg-white p-6 shadow-raised"
    >
      <div className="flex items-start gap-3">
        <Logo variant="mark" size={40} label="" />
        <div className="min-w-0 flex-1">
          <h2 className="text-heading text-navy">{t('owner.assistant.title')}</h2>
          <p className="text-caption text-muted">{t('owner.assistant.subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label={t('common.close')}
          className="inline-flex size-11 items-center justify-center rounded-full bg-soft text-navy"
        >
          ×
        </button>
      </div>

      {brief.data ? (
        <div className="flex flex-col gap-3">
          <Callout tone="info" title={brief.data.text} />
          {brief.data.items.map((i) => (
            <Link
              key={i.caseId}
              href={
                i.draftMessageId
                  ? `${base}/messages/${i.draftMessageId}`
                  : i.latestSent
                    ? `${base}/messages/${i.latestSent.messageId}`
                    : `${base}/follow-ups/${i.caseId}`
              }
              className="flex min-h-11 flex-col gap-0.5 rounded-16 border border-border p-3 hover:bg-soft"
            >
              <span className="text-label text-navy">
                <bdi>{i.student.displayName}</bdi> • {i.reason}
              </span>
              <span className="text-caption text-muted">
                {i.blocked
                  ? t('owner.assistant.blocked')
                  : i.draftMessageId
                    ? t('owner.assistant.draftReady')
                    : i.latestSent
                      ? t('owner.assistant.lastMessage', {
                          status: messageStatus(t, i.latestSent.status).label,
                        })
                      : t('owner.assistant.noDraft')}
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      <div aria-live="polite" className="flex flex-col gap-4" data-testid="assistant-turns">
        {turns.map((x) => (
          <div key={x.id} className="flex flex-col gap-2">
            <p className="self-end rounded-16 bg-blue px-4 py-2 text-body text-navy" dir="auto">
              {x.user}
            </p>
            <div className="flex flex-col gap-2 rounded-16 border border-border p-3">
              <span className="flex flex-wrap gap-2">
                {x.tier ? (
                  <StatusBadge tone={x.tier === 'act' ? 'warning' : 'info'}>
                    {tierLabel(x.tier)}
                  </StatusBadge>
                ) : null}
                {/* The answers are scripted until the assistant runs on ai-service: say so (B3). */}
                <StatusBadge tone="neutral" data-testid="demo-answer">
                  {t('owner.assistant.demoAnswer')}
                </StatusBadge>
              </span>
              {x.text || !x.done ? (
                <p className="text-body text-navy" data-testid="assistant-answer">
                  {x.text}
                  {!x.done ? <span className="animate-pulse">▍</span> : null}
                </p>
              ) : null}
              {x.cards.map((c, i) =>
                c.type === 'draft' ? (
                  <div
                    key={i}
                    className="flex flex-col gap-2 rounded-12 bg-soft p-3"
                    data-testid="assistant-draft"
                  >
                    <p className="text-label text-navy">
                      <bdi>{c.student.displayName}</bdi> •{' '}
                      {t('owner.assistant.guardian', { name: c.guardian })}
                    </p>
                    <ul className="flex flex-col gap-1 text-caption text-muted">
                      {c.evidence.map((ev) => (
                        <li key={ev}>• {ev}</li>
                      ))}
                    </ul>
                    <StatusBadge tone="success" className="self-start">
                      {t('owner.assistant.draftReadyTone')}
                    </StatusBadge>
                    <Link
                      href={`${base}/messages/${c.messageId}`}
                      className="inline-flex min-h-11 items-center justify-center rounded-12 bg-blue px-4 text-label text-navy"
                    >
                      {t('owner.assistant.reviewDraft')}
                    </Link>
                  </div>
                ) : c.type === 'list' ? (
                  <ul key={i} className="flex flex-col gap-1">
                    {c.items.map((it) => (
                      <li key={it.label} className="text-caption">
                        {it.href ? (
                          <Link href={`${base}/${it.href}`} className="text-blueText">
                            <bdi>{it.label}</bdi>
                          </Link>
                        ) : (
                          <bdi>{it.label}</bdi>
                        )}{' '}
                        — <span className="text-muted">{it.detail}</span>
                      </li>
                    ))}
                  </ul>
                ) : c.type === 'needs_approval' ? (
                  <Callout key={i} tone="warning" title={t('owner.assistant.needsApproval')}>
                    {c.text}
                  </Callout>
                ) : null,
              )}
            </div>
          </div>
        ))}
      </div>

      {error ? (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      ) : null}

      <div className="mt-auto flex flex-col gap-3">
        <p className="text-caption uppercase text-muted">{t('owner.assistant.tryLabel')}</p>
        <div className="flex flex-wrap gap-2">
          {[
            t('owner.assistant.tryContacted'),
            t('owner.assistant.trySummary'),
            t('owner.assistant.tryMissing'),
          ].map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => ask(s)}>
              <Chip>{s}</Chip>
            </button>
          ))}
        </div>
        <form
          className="flex items-end gap-2 rounded-16 border-2 border-blue p-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(text);
          }}
        >
          <label className="sr-only" htmlFor="assistant-input">
            {t('owner.assistant.inputLabel')}
          </label>
          <input
            id="assistant-input"
            data-testid="assistant-input"
            dir="auto"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('owner.assistant.placeholder')}
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-body outline-none"
          />
          <Button
            type="submit"
            variant="secondary"
            disabled={busy || !text.trim()}
            data-testid="assistant-send"
          >
            {t('owner.assistant.send')}
          </Button>
          <button
            type="button"
            data-testid="assistant-mic"
            aria-pressed={recording}
            disabled={busy && !recording}
            aria-label={recording ? t('owner.assistant.micStop') : t('owner.assistant.micStart')}
            onClick={() => (recording ? stopVoice() : startVoice())}
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${recording ? 'bg-red text-white' : 'bg-blue text-navy'}`}
          >
            {recording ? '■' : '🎙'}
          </button>
        </form>
        <p className="text-caption text-muted">{t('owner.assistant.onlyDrafts')}</p>
      </div>
    </aside>
  );
}
