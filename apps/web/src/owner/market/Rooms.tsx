'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  marketApi,
  type AutoApproveRules,
  type Facility,
  type Hall,
  type RentBasis,
  type WeeklySlot,
} from '@link/api-client';
import { formatClock, formatWeekday, normalizeDigits } from '@link/i18n';
import {
  Button,
  Callout,
  Card,
  FilterChip,
  Input,
  RadioCards,
  StatusBadge,
  Switch,
  cn,
  useToast,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, num, useCentre, useIsOwner } from '../common';
import { FACILITIES, facilityLabel, ruleText } from './shared';

const DAYS = [6, 7, 1, 2, 3, 4];
const TIMES = ['14:00', '16:00', '18:00', '20:00'];

/**
 * C05 · Rooms & rent (MKT-CEN-03, MKT-HAL-05): each hall's seats, facilities and ONE rent rule
 * (fixed per session, per student per session, or a share of fees), the weekly slots offered to
 * teachers, and the centre's auto-approve rules (off by default). Teachers see free slots on the
 * Link map (J01) and request them (C06).
 */
export function RoomsRent() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const q = useQuery({
    queryKey: ['halls', centreId, locale],
    queryFn: () => marketApi.halls(centreId),
  });
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <>
      <OwnerPageHeader title={t('centre.rooms.title')} subtitle={t('centre.rooms.subtitle')} />
      <QueryState query={q} loadingRows={4}>
        {(halls) => {
          const hall = halls.find((h) => h.id === selected) ?? halls[0];
          return (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_440px]">
              <ul className="flex flex-col gap-3" aria-label={t('centre.rooms.list')}>
                {halls.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(h.id)}
                      aria-pressed={hall?.id === h.id}
                      data-testid={`hall-${h.id}`}
                      className={cn(
                        'flex w-full items-center gap-4 rounded-16 border bg-white p-4 text-start shadow-card',
                        hall?.id === h.id ? 'border-blue ring-2 ring-blue/30' : 'border-border',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'h-14 w-16 shrink-0 rounded-12',
                          PHOTO[h.photo % PHOTO.length],
                        )}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-label text-navy">{h.name}</span>
                          <span className="text-caption text-muted">
                            {t('centre.schedule.seats', {
                              count: h.capacity,
                              n: num(h.capacity, locale),
                            })}
                          </span>
                        </span>
                        <span className="text-caption text-muted">
                          {h.facilities.map((f) => facilityLabel(f, t)).join(' • ')}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-label text-blueText">
                            {ruleText(h.rentRule, t, locale)}
                          </span>
                          <span className="text-caption text-green">
                            {h.listed
                              ? t('centre.rooms.freeSlots', {
                                  count: h.freeSlotsPerWeek,
                                  n: num(h.freeSlotsPerWeek, locale),
                                })
                              : t('centre.rooms.hidden')}
                          </span>
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-6">
                {hall ? <HallEditor key={hall.id} hall={hall} /> : null}
                <AutoApprove centreId={centreId} />
              </div>
            </div>
          );
        }}
      </QueryState>
    </>
  );
}

const PHOTO = [
  'bg-linear-to-br from-blue to-navy',
  'bg-linear-to-br from-green to-navy',
  'bg-linear-to-br from-[#7c5cff] to-navy',
  'bg-linear-to-br from-amber to-navy',
];

function HallEditor({ hall }: { hall: Hall }) {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(hall.name);
  const [seats, setSeats] = useState(String(hall.capacity));
  const [facilities, setFacilities] = useState<Facility[]>(hall.facilities);
  const [basis, setBasis] = useState<RentBasis>(hall.rentRule.basis);
  const [amount, setAmount] = useState(
    hall.rentRule.amount ? String(hall.rentRule.amount.amountPt / 100) : '',
  );
  const [percent, setPercent] = useState(String(hall.rentRule.percent ?? 20));
  const owner = useIsOwner();
  const [closed, setClosed] = useState<Set<string>>(
    new Set(hall.slots.filter((s) => s.state === 'closed').map((s) => `${s.weekday}|${s.start}`)),
  );
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const closedSlots: WeeklySlot[] = [...closed].map((k) => {
        const [weekday, start] = k.split('|') as [string, string];
        return { weekday: Number(weekday), start, end: '' };
      });
      const n = Number(normalizeDigits(amount));
      return marketApi.updateHall(hall.id, {
        name,
        capacity: Number(normalizeDigits(seats)),
        facilities,
        rentRule:
          basis === 'percent_of_fees'
            ? { basis, percent: Number(normalizeDigits(percent)) }
            : { basis, amountPt: Math.round(n * 100) },
        closedSlots,
      });
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ['halls', centreId] });
      void qc.invalidateQueries({ queryKey: ['schedule', centreId] });
      toast(t('centre.rooms.saved'));
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.title')),
  });

  return (
    <Card className="flex flex-col gap-4" data-testid="hall-editor">
      <h2 className="text-heading text-navy">{t('centre.rooms.edit', { name: hall.name })}</h2>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <Input
          label={t('centre.rooms.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
        />
        <Input
          label={t('centre.rooms.seats')}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          inputMode="numeric"
          maxLength={3}
          data-testid="hall-seats"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-navy">{t('centre.rooms.facilities')}</legend>
        <div className="flex flex-wrap gap-2">
          {FACILITIES.map((f) => (
            <FilterChip
              key={f}
              pressed={facilities.includes(f)}
              onPressedChange={(on) =>
                setFacilities((cur) => (on ? [...cur, f] : cur.filter((x) => x !== f)))
              }
            >
              {facilityLabel(f, t)}
            </FilterChip>
          ))}
        </div>
      </fieldset>
      <RadioCards
        label={t('centre.rooms.howPay')}
        value={basis}
        onValueChange={(v) => setBasis(v as RentBasis)}
        layout="list"
        options={[
          {
            value: 'fixed_per_session',
            title: t('centre.rooms.fixed'),
            description: t('centre.rooms.fixedHint'),
          },
          {
            value: 'per_student_per_session',
            title: t('centre.rooms.perStudent'),
            description: t('centre.rooms.perStudentHint'),
          },
          {
            value: 'percent_of_fees',
            title: t('centre.rooms.percent'),
            description: t('centre.rooms.percentHint'),
          },
        ]}
      />
      {basis === 'percent_of_fees' ? (
        <Input
          label={t('centre.rooms.percentLabel')}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          inputMode="numeric"
          maxLength={2}
        />
      ) : (
        <Input
          label={t(
            basis === 'fixed_per_session'
              ? 'centre.rooms.amountSession'
              : 'centre.rooms.amountStudent',
          )}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          maxLength={6}
        />
      )}
      {basis === 'per_student_per_session' ? (
        // OD-13 is open: which students count. Phase 1 default: confirmed enrolled students.
        <Callout tone="warning">{t('centre.rooms.perStudentPending')}</Callout>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-navy">{t('centre.rooms.slots')}</legend>
        <div className="grid grid-cols-6 gap-1.5" role="group">
          {DAYS.map((d) => (
            <span key={d} className="text-center text-caption text-muted">
              {formatWeekday(d, locale)}
            </span>
          ))}
          {TIMES.flatMap((tm) =>
            DAYS.map((d) => {
              const slot = hall.slots.find((s) => s.weekday === d && s.start === tm);
              const taken = slot?.state === 'taken';
              const key = `${d}|${tm}`;
              const isClosed = closed.has(key);
              const label = `${formatWeekday(d, locale, 'long')} ${formatClock(tm, locale)}`;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={taken}
                  aria-pressed={!taken && !isClosed}
                  aria-label={`${label}: ${taken ? t('centre.rooms.taken') : isClosed ? t('centre.rooms.closed') : t('centre.rooms.open')}`}
                  onClick={() =>
                    setClosed((cur) => {
                      const next = new Set(cur);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className={cn(
                    'min-h-11 rounded-8 text-caption',
                    taken
                      ? 'bg-soft text-muted'
                      : isClosed
                        ? 'border border-dashed border-border bg-white text-muted line-through'
                        : 'bg-greenSoft font-semibold text-green',
                  )}
                >
                  {taken ? t('centre.rooms.taken') : formatClock(tm, locale)}
                </button>
              );
            }),
          )}
        </div>
        <p className="text-caption text-muted">{t('centre.rooms.slotsHint')}</p>
      </fieldset>
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
      {owner ? (
        <Button
          block
          onClick={() => save.mutate()}
          disabled={save.isPending}
          data-testid="save-hall"
        >
          {t('centre.rooms.save')}
        </Button>
      ) : (
        <div data-testid="owner-only">
          <Callout tone="info">{t('centre.ownerOnly.edit')}</Callout>
        </div>
      )}
    </Card>
  );
}

function AutoApprove({ centreId }: { centreId: string }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['auto-approve', centreId],
    queryFn: () => marketApi.autoApprove(centreId),
  });
  const [rules, setRules] = useState<AutoApproveRules | null>(null);
  useEffect(() => {
    if (q.data) setRules(q.data);
  }, [q.data]);
  const owner = useIsOwner();
  const put = useMutation({
    mutationFn: (r: AutoApproveRules) => marketApi.putAutoApprove(centreId, r),
    onSuccess: (r) => {
      setRules(r);
      void qc.invalidateQueries({ queryKey: ['room-requests', centreId] });
    },
  });
  if (!rules) return null;
  return (
    <div
      className="flex flex-col gap-3 rounded-16 border border-border bg-soft p-4"
      data-testid="auto-approve"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-label text-navy" id="auto-title">
          {t('centre.rooms.autoTitle')}
        </h2>
        <Switch
          checked={rules.enabled}
          onCheckedChange={(enabled) => put.mutate({ ...rules, enabled })}
          label={t('centre.rooms.autoTitle')}
          testId="auto-approve-switch"
          disabled={!owner}
        />
      </div>
      <StatusBadge tone={rules.enabled ? 'success' : 'neutral'}>
        {t(rules.enabled ? 'centre.rooms.autoOn' : 'centre.rooms.autoOff')}
      </StatusBadge>
      <ul className="flex flex-col gap-1 text-caption text-navy">
        <li>✓ {t('centre.rooms.ruleId')}</li>
        <li>✓ {t('centre.rooms.ruleRating', { rating: rules.minRating })}</li>
        <li>✓ {t('centre.rooms.ruleFits')}</li>
      </ul>
      <p className="text-caption text-muted">{t('centre.rooms.autoOtherwise')}</p>
    </div>
  );
}
