'use client';

import { useState } from 'react';
import { opsApi, type CentreApplication, type CentreStage, type OpsLead } from '@link/api-client';
import { createTranslator, formatNumber, type Locale, type MessageKey } from '@link/i18n';
import { Button, Card, MapView, Segmented, StatusBadge } from '@link/ui';
import {
  ActionError,
  Checklist,
  DueBadge,
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

const STAGES: CentreStage[] = [
  'new',
  'call_scheduled',
  'visit_booked',
  'live',
  'rejected',
  'revoked',
];

/** L01 · Centre join requests (MKT-OPS-01, BR-VER-01, BR-VER-02). */
export function CentresScreen({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const [stage, setStage] = useState<CentreStage>('new');
  const q = useLoad(() => opsApi.centreApplications(stage), [stage]);
  return (
    <>
      <Header
        title={t('ops.centres.title')}
        lead={t('ops.centres.lead')}
        side={
          <Segmented
            label={t('ops.centres.stageLabel')}
            value={stage}
            onValueChange={(v) => setStage(v as CentreStage)}
            options={STAGES.map((s) => ({
              value: s,
              label: t(`ops.centres.stage.${s}` as MessageKey),
            }))}
          />
        }
      />
      {stage === 'new' && q.data?.leads.length ? (
        <section className="mb-8 flex flex-col gap-3" aria-labelledby="leads">
          <h2 id="leads" className="text-heading">
            {t('ops.leads.title')}
          </h2>
          {q.data.leads.map((l) => (
            <LeadCard key={l.id} t={t} locale={locale} lead={l} reload={q.reload} />
          ))}
        </section>
      ) : null}
      <ListState t={t} {...q} data={q.data?.centres ?? null} empty={t('ops.centres.empty')}>
        {(rows) => (
          <div className="flex flex-col gap-4">
            {rows.map((c) => (
              <CentreCard key={c.id} t={t} locale={locale} c={c} reload={q.reload} />
            ))}
          </div>
        )}
      </ListState>
    </>
  );
}

function LeadCard({
  t,
  locale,
  lead,
  reload,
}: {
  t: T;
  locale: Locale;
  lead: OpsLead;
  reload: () => void;
}) {
  const a = useAction(t, reload);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3" data-testid="lead">
      <div className="flex flex-col gap-1">
        <span className="text-label text-navy">{lead.centreName ?? lead.name}</span>
        <span className="text-caption text-muted">
          {[
            lead.name,
            lead.area,
            lead.teacherCount != null ? t('ops.leads.teachers', { n: lead.teacherCount }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}{' '}
          · {when(lead.createdAt, locale)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone={lead.status === 'new' ? 'info' : 'neutral'}>
          {t(`ops.leads.status.${lead.status}` as MessageKey)}
        </StatusBadge>
        {lead.status === 'new' ? (
          <Button
            variant="secondary"
            disabled={a.busy}
            onClick={() => a.run(() => opsApi.leadStatus(lead.id, 'contacted'))}
          >
            {t('ops.leads.contacted')}
          </Button>
        ) : null}
        <Button
          variant="quiet"
          disabled={a.busy}
          onClick={() => a.run(() => opsApi.leadStatus(lead.id, 'discarded'))}
        >
          {t('ops.leads.discard')}
        </Button>
      </div>
      <ActionError error={a.error} />
    </Card>
  );
}

function CentreCard({
  t,
  locale,
  c,
  reload,
}: {
  t: T;
  locale: Locale;
  c: CentreApplication;
  reload: () => void;
}) {
  const a = useAction(t, reload);
  const open = ['new', 'call_scheduled', 'visit_booked'].includes(c.stage);
  return (
    <Card padding="lg" className="flex flex-col gap-4" data-testid="centre-application">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-heading">{c.name}</h2>
          <p className="text-body text-muted">
            {[c.area, c.governorate].filter(Boolean).join('، ')}
            {c.address ? ` · ${c.address}` : ''}
          </p>
          <p className="text-caption text-muted">
            {t('ops.centres.owner', { name: c.ownerName ?? '—' })}{' '}
            <Last4 last4={c.ownerPhoneLast4} /> · {t('ops.centres.halls', { n: c.halls })} ·{' '}
            {t('ops.centres.joined', { when: when(c.createdAt, locale) })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={
              c.stage === 'live'
                ? 'success'
                : c.stage === 'rejected' || c.stage === 'revoked'
                  ? 'error'
                  : 'info'
            }
          >
            {t(`ops.centres.stage.${c.stage}` as MessageKey)}
          </StatusBadge>
          {c.locationUnderReview ? (
            <StatusBadge tone="warning">{t('ops.centres.pinUnderReview')}</StatusBadge>
          ) : null}
          {c.callDueAt ? (
            <span className="flex items-center gap-1 text-caption text-muted">
              {t('ops.centres.callTarget')} <DueBadge t={t} dueAt={c.callDueAt} />
            </span>
          ) : null}
        </div>
      </div>

      {open ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('ops.centres.stageLabel')}>
          {(['new', 'call_scheduled', 'visit_booked'] as const).map((s) => (
            <Button
              key={s}
              variant={c.stage === s ? 'primary' : 'quiet'}
              disabled={a.busy || c.stage === s}
              aria-pressed={c.stage === s}
              onClick={() => a.run(() => opsApi.setCentreStage(c.id, s))}
            >
              {t(`ops.centres.stage.${s}` as MessageKey)}
            </Button>
          ))}
        </div>
      ) : null}

      {c.pendingLocation ? <PinCompare c={c} t={t} /> : null}

      <Checklist
        t={t}
        locale={locale}
        checks={c.checks}
        busy={a.busy}
        editable={(x) => open || (c.locationUnderReview && x.code === 'address_pin_match')}
        onSet={(x, status) => a.run(() => opsApi.putCheck('centre', c.id, x.code, { status }))}
      />

      <div className="flex flex-wrap items-start gap-2">
        {open || c.locationUnderReview ? (
          <Button
            disabled={a.busy || !c.canApprove}
            onClick={() => a.run(() => opsApi.approveCentre(c.id))}
            data-testid="approve-centre"
          >
            {c.stage === 'live' ? t('ops.centres.approvePin') : t('ops.centres.approve')}
          </Button>
        ) : null}
        {open ? (
          <ReasonAction
            t={t}
            label={t('ops.centres.reject')}
            field={t('ops.common.reason')}
            busy={a.busy}
            danger
            onConfirm={(r) => a.run(() => opsApi.rejectCentre(c.id, r))}
          />
        ) : null}
        {c.stage === 'live' ? (
          <ReasonAction
            t={t}
            label={t('ops.centres.revoke')}
            field={t('ops.common.reason')}
            busy={a.busy}
            danger
            onConfirm={(r) => a.run(() => opsApi.revokeCentre(c.id, r))}
          />
        ) : null}
      </div>
      {open && !c.canApprove ? (
        <p className="text-caption text-muted">
          {t('ops.centres.approveLocked', {
            n: c.checks.filter((x) => x.status !== 'done').length,
            total: formatNumber(c.checks.length, locale),
          })}
        </p>
      ) : null}
      <ActionError error={a.error} />
      <Notes t={t} locale={locale} subjectType="centre" subjectId={c.id} initial={c.notes} />
      <History t={t} locale={locale} objectType="centre" objectRef={c.id} />
    </Card>
  );
}

/** Metres between two points (haversine). */
const metres = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = (d: number) => (d * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * 6_371_000 * Math.asin(Math.sqrt(h)));
};

/**
 * CF-44 review (Part B): the pin the public sees now and the owner's new one on one map, with the
 * distance moved and both addresses side by side. Approving copies the new one to the public.
 */
function PinCompare({ c, t }: { c: CentreApplication; t: T }) {
  const next = c.pendingLocation!;
  const now = c.location;
  const lines = (x: {
    address: string;
    street: string;
    area: string;
    governorate: string;
    landmark: string;
  }) => (
    <>
      <p className="text-label text-navy">{x.address}</p>
      <p className="text-caption text-muted">
        {[x.street, x.area, x.governorate].filter(Boolean).join('، ')}
      </p>
      {x.landmark ? <p className="text-caption text-muted">{x.landmark}</p> : null}
    </>
  );
  return (
    <section
      aria-label={t('ops.centres.pinCompare')}
      className="flex flex-col gap-3"
      data-testid="pin-compare"
    >
      <h3 className="text-label text-navy">{t('ops.centres.pinCompare')}</h3>
      <MapView
        label={t('ops.centres.pinCompare')}
        centre={next}
        showCentre={false}
        zoom={16}
        className="h-56"
        pins={[
          ...(now
            ? [
                {
                  id: 'old',
                  lat: now.lat,
                  lng: now.lng,
                  label: t('ops.centres.pinOld'),
                  state: 'waitlist' as const,
                },
              ]
            : []),
          {
            id: 'new',
            lat: next.lat,
            lng: next.lng,
            label: t('ops.centres.pinNew'),
            state: 'open' as const,
            selected: true,
          },
        ]}
      />
      <p className="text-caption text-muted" data-testid="pin-moved">
        {now ? t('ops.centres.pinMoved', { metres: metres(now, next) }) : t('ops.centres.pinFirst')}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1" data-testid="pin-old">
          <p className="text-caption font-semibold text-amber">{t('ops.centres.pinOld')}</p>
          {now ? (
            lines(now)
          ) : (
            <p className="text-caption text-muted">{t('ops.centres.pinFirst')}</p>
          )}
        </div>
        <div className="flex flex-col gap-1" data-testid="pin-new">
          <p className="text-caption font-semibold text-blueText">{t('ops.centres.pinNew')}</p>
          {lines(next)}
        </div>
      </div>
    </section>
  );
}
