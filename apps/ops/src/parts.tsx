'use client';

import { useState, type ReactNode } from 'react';
import {
  ApiError,
  opsApi,
  type OpsNote,
  type OpsNoteSubject,
  type VerificationCheck,
  type VerificationCheckStatus,
} from '@link/api-client';
import {
  createTranslator,
  formatDate,
  formatNumber,
  type Locale,
  type MessageKey,
} from '@link/i18n';
import {
  Button,
  Callout,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  StatusBadge,
  Textarea,
} from '@link/ui';
import { useLoad } from './useLoad';

export type T = ReturnType<typeof createTranslator>;

/** Date and time in Cairo, in the locale's digits (11 §RTL). */
export const when = (iso: string, locale: Locale) =>
  formatDate(iso, locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** The message for a failed action: the API's own words for a known code, else the generic one. */
export function problemText(e: unknown, t: T) {
  if (e instanceof ApiError) {
    if (e.isNetwork) return t('states.offline.body');
    const known: Record<string, string> = {
      checks_incomplete: 'ops.errors.checksIncomplete',
      already_decided: 'ops.errors.alreadyDecided',
      not_verified: 'ops.errors.notVerified',
      reason_required: 'ops.errors.reasonRequired',
      validation_failed: 'ops.errors.reasonRequired',
      nothing_to_refund: 'ops.errors.nothingToRefund',
      account_not_verified: 'ops.errors.accountNotVerified',
      insufficient_balance: 'ops.errors.insufficientBalance',
      not_failed: 'ops.errors.alreadyDecided',
      ops_permission_required: 'ops.gate.notOps',
      ops_ip_not_allowed: 'ops.gate.ipNotAllowed',
    };
    if (known[e.code]) return t(known[e.code] as MessageKey);
  }
  return t('states.error.body');
}

/** Loading, error and empty states around a list (11 §4). */
export function ListState<X>({
  t,
  data,
  error,
  loading,
  reload,
  empty,
  children,
}: {
  t: T;
  data: X[] | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
  empty: string;
  children: (rows: X[]) => ReactNode;
}) {
  if (loading && !data) return <LoadingState label={t('states.loading.label')} rows={3} />;
  if (error)
    return (
      <ErrorState
        title={t('states.error.title')}
        body={problemText(error, t)}
        action={
          <Button variant="secondary" onClick={reload}>
            {t('common.retry')}
          </Button>
        }
      />
    );
  if (!data?.length) return <EmptyState title={empty} />;
  return <>{children(data)}</>;
}

/** Page title and a short line under it. */
export function Header({ title, lead, side }: { title: string; lead?: string; side?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">{title}</h1>
        {lead ? <p className="text-body text-muted">{lead}</p> : null}
      </div>
      {side}
    </header>
  );
}

/** Runs one action at a time; shows its error under the buttons. */
export function useAction(t: T, done: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
      done();
    } catch (e) {
      setError(problemText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

export function ActionError({ error }: { error: string | null }) {
  return error ? (
    <Callout tone="error" role="alert">
      {error}
    </Callout>
  ) : null;
}

/**
 * A decision that needs a written reason (reject, revoke, deny, ask to edit): the button opens a
 * field; confirming sends it. Nothing is sent without the text.
 */
export function ReasonAction({
  t,
  label,
  field,
  busy,
  danger,
  onConfirm,
  testId,
}: {
  t: T;
  label: string;
  field: string;
  busy: boolean;
  danger?: boolean;
  onConfirm: (reason: string) => void;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open)
    return (
      <Button
        variant="secondary"
        danger={danger}
        onClick={() => setOpen(true)}
        data-testid={testId}
      >
        {label}
      </Button>
    );
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onConfirm(text.trim());
      }}
    >
      <Input
        label={field}
        value={text}
        maxLength={500}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2">
        <Button type="submit" danger={danger} disabled={busy || !text.trim()}>
          {label}
        </Button>
        <Button
          type="button"
          variant="quiet"
          onClick={() => {
            setOpen(false);
            setText('');
          }}
        >
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

const CHECK_TONE: Record<VerificationCheckStatus, 'neutral' | 'success' | 'error' | 'warning'> = {
  pending: 'neutral',
  done: 'success',
  failed: 'error',
  waived: 'warning',
};

/** BR-VER-01 checklist: each check with who did it and when (MKT-OPS-01 AC2). */
export function Checklist({
  t,
  locale,
  checks,
  editable,
  busy,
  onSet,
}: {
  t: T;
  locale: Locale;
  checks: VerificationCheck[];
  editable: (c: VerificationCheck) => boolean;
  busy: boolean;
  onSet: (c: VerificationCheck, status: VerificationCheckStatus) => void;
}) {
  return (
    <ul className="flex flex-col divide-y divide-border rounded-12 border border-border">
      {checks.map((c) => (
        <li
          key={c.code}
          className="flex flex-wrap items-center justify-between gap-3 p-3"
          data-testid={`check-${c.code}`}
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-label text-navy">{t(`ops.checks.${c.code}` as MessageKey)}</span>
            {c.doneAt ? (
              <span className="text-caption text-muted">
                {t('ops.checks.by', { name: c.doneByName ?? '—', when: when(c.doneAt, locale) })}
              </span>
            ) : null}
            {c.notes ? <span className="text-caption text-muted">{c.notes}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge tone={CHECK_TONE[c.status]}>
              {t(`ops.checks.status.${c.status}` as MessageKey)}
            </StatusBadge>
            {editable(c) ? (
              c.status === 'pending' ? (
                <>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => onSet(c, 'done')}
                    data-testid={`check-${c.code}-done`}
                  >
                    {t('ops.checks.markDone')}
                  </Button>
                  <Button variant="quiet" disabled={busy} onClick={() => onSet(c, 'failed')}>
                    {t('ops.checks.markFailed')}
                  </Button>
                </>
              ) : (
                <Button variant="quiet" disabled={busy} onClick={() => onSet(c, 'pending')}>
                  {t('ops.checks.undo')}
                </Button>
              )
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Internal notes (MKT-OPS-01 AC3): ops only, never shown outside the console. */
export function Notes({
  t,
  locale,
  subjectType,
  subjectId,
  initial,
}: {
  t: T;
  locale: Locale;
  subjectType: OpsNoteSubject;
  subjectId: string;
  initial: OpsNote[];
}) {
  const [notes, setNotes] = useState(initial);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-2" aria-label={t('ops.notes.title')}>
      <h3 className="text-label text-navy">{t('ops.notes.title')}</h3>
      {notes.length ? (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-8 bg-soft p-3 text-body">
              <p>{n.body}</p>
              <p className="mt-1 text-caption text-muted">
                {n.authorName} · {when(n.createdAt, locale)}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-col gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          setError(null);
          try {
            const n = await opsApi.addNote(subjectType, subjectId, text.trim());
            setNotes((xs) => [...xs, n]);
            setText('');
          } catch (err) {
            setError(problemText(err, t));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Textarea
          label={t('ops.notes.add')}
          hideLabel
          placeholder={t('ops.notes.placeholder')}
          maxLength={2000}
          value={text}
          onChange={(e) => setText(e.target.value)}
          counter={(n, max) => `${formatNumber(n, locale)} / ${formatNumber(max, locale)}`}
          rows={2}
        />
        <ActionError error={error} />
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || !text.trim()}
          className="self-start"
        >
          {t('ops.notes.add')}
        </Button>
      </form>
    </section>
  );
}

/** What happened to this object (MKT-OPS-08 audit lookup), loaded when opened. */
export function History({
  t,
  locale,
  objectType,
  objectRef,
}: {
  t: T;
  locale: Locale;
  objectType: string;
  objectRef: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="text-body" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="min-h-11 cursor-pointer py-2 text-label text-blueText">
        {t('ops.history.title')}
      </summary>
      {open ? (
        <HistoryRows t={t} locale={locale} objectType={objectType} objectRef={objectRef} />
      ) : null}
    </details>
  );
}

function HistoryRows({
  t,
  locale,
  objectType,
  objectRef,
}: {
  t: T;
  locale: Locale;
  objectType: string;
  objectRef: string;
}) {
  const q = useLoad(() => opsApi.audit(objectType, objectRef), [objectType, objectRef]);
  return (
    <ListState t={t} {...q} empty={t('ops.history.empty')}>
      {(rows) => (
        <ol className="flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.id} className="text-caption text-muted">
              <bdi dir="ltr" className="font-mono">
                {r.action}
              </bdi>{' '}
              · {r.actorName ?? t('ops.history.system')} · {when(r.occurredAt, locale)}
              {r.reason ? ` · ${r.reason}` : ''}
            </li>
          ))}
        </ol>
      )}
    </ListState>
  );
}

/** "Due in 5 h" / "Overdue by 2 h" against a target (BR-VER-02, MKT-OPS-03 AC2, PDPL). */
export function DueBadge({ t, dueAt }: { t: T; dueAt: string }) {
  const ms = new Date(dueAt).getTime() - Date.now();
  const hours = Math.max(1, Math.round(Math.abs(ms) / 3_600_000));
  const value =
    hours >= 48 ? { key: 'Days', n: Math.round(hours / 24) } : { key: 'Hours', n: hours };
  return ms < 0 ? (
    <StatusBadge tone="error">
      {t(`ops.due.overdue${value.key}` as MessageKey, { n: value.n })}
    </StatusBadge>
  ) : (
    <StatusBadge tone={hours <= 12 ? 'warning' : 'neutral'}>
      {t(`ops.due.in${value.key}` as MessageKey, { n: value.n })}
    </StatusBadge>
  );
}

/** A phone shown only by its last 4 digits, left-to-right (RTL-09). */
export const Last4 = ({ last4 }: { last4: string | null }) =>
  last4 ? (
    <bdi dir="ltr" className="whitespace-nowrap">
      •••• {last4}
    </bdi>
  ) : null;
