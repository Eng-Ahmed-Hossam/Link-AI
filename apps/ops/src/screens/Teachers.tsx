'use client';

import { useState } from 'react';
import { opsApi, type OpsTeacher } from '@link/api-client';
import { createTranslator, type Locale, type MessageKey } from '@link/i18n';
import { Button, Callout, Card, Segmented, StatusBadge } from '@link/ui';
import {
  ActionError,
  Checklist,
  Header,
  History,
  Last4,
  ListState,
  Notes,
  ReasonAction,
  type T,
  useAction,
  when,
} from '../parts';
import { useLoad } from '../useLoad';

type Filter = 'pending' | 'verified' | 'rejected' | 'revoked';

/** Teacher verification queue (MKT-OPS-02, BR-VER-03/04): manual ID review until eKYC (OD-19). */
export function TeachersScreen({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const [filter, setFilter] = useState<Filter>('pending');
  const q = useLoad(() => opsApi.teachers(filter), [filter]);
  return (
    <>
      <Header
        title={t('ops.teachers.title')}
        lead={t('ops.teachers.lead')}
        side={
          <Segmented
            label={t('ops.teachers.filter')}
            value={filter}
            onValueChange={(v) => setFilter(v as Filter)}
            options={(['pending', 'verified', 'rejected', 'revoked'] as const).map((s) => ({
              value: s,
              label: t(`ops.teachers.status.${s}` as MessageKey),
            }))}
          />
        }
      />
      <Callout tone="info" className="mb-4">
        {t('ops.teachers.manualNote')}
      </Callout>
      <ListState t={t} {...q} empty={t('ops.teachers.empty')}>
        {(rows) => (
          <div className="flex flex-col gap-4">
            {rows.map((x) => (
              <TeacherCard key={x.id} t={t} locale={locale} x={x} reload={q.reload} />
            ))}
          </div>
        )}
      </ListState>
    </>
  );
}

function TeacherCard({
  t,
  locale,
  x,
  reload,
}: {
  t: T;
  locale: Locale;
  x: OpsTeacher;
  reload: () => void;
}) {
  const a = useAction(t, reload);
  const verified = x.verification === 'verified';
  return (
    <Card padding="lg" className="flex flex-col gap-4" data-testid="ops-teacher">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading">{x.name}</h2>
          <p className="text-caption text-muted">
            <Last4 last4={x.phoneLast4} /> · {x.subjects.join('، ') || '—'} ·{' '}
            {t('ops.teachers.groups', { n: x.groups })} ·{' '}
            {t('ops.centres.joined', { when: when(x.createdAt, locale) })}
          </p>
        </div>
        <StatusBadge
          tone={
            verified
              ? 'success'
              : x.verification === 'pending' || x.verification === 'not_started'
                ? 'info'
                : 'error'
          }
        >
          {t(`ops.teachers.verification.${x.verification}` as MessageKey)}
        </StatusBadge>
      </div>
      <Checklist
        t={t}
        locale={locale}
        checks={x.checks}
        busy={a.busy}
        // The ID check is decided by Verify / Reject below; the badges are recorded here.
        editable={(c) => c.code !== 'ekyc_id'}
        onSet={(c, status) => a.run(() => opsApi.putCheck('teacher', x.id, c.code, { status }))}
      />
      <div className="flex flex-wrap items-start gap-2">
        {!verified ? (
          <Button
            disabled={a.busy}
            onClick={() => a.run(() => opsApi.decideTeacher(x.id, 'verify'))}
            data-testid="verify-teacher"
          >
            {t('ops.teachers.verify')}
          </Button>
        ) : null}
        {!verified && x.verification !== 'rejected' ? (
          <ReasonAction
            t={t}
            label={t('ops.teachers.reject')}
            field={t('ops.common.reason')}
            busy={a.busy}
            danger
            onConfirm={(r) => a.run(() => opsApi.decideTeacher(x.id, 'reject', r))}
          />
        ) : null}
        {verified ? (
          <ReasonAction
            t={t}
            label={t('ops.teachers.revoke')}
            field={t('ops.common.reason')}
            busy={a.busy}
            danger
            onConfirm={(r) => a.run(() => opsApi.decideTeacher(x.id, 'revoke', r))}
          />
        ) : null}
      </div>
      <ActionError error={a.error} />
      <Notes t={t} locale={locale} subjectType="teacher" subjectId={x.id} initial={x.notes} />
      <History t={t} locale={locale} objectType="teacher" objectRef={x.id} />
    </Card>
  );
}
