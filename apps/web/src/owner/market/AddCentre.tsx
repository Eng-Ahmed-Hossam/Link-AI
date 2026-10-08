'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { api, ApiError, marketApi, queryKeys, type CentreApplicationBody } from '@link/api-client';
import { normalizeEgyptPhone } from '@link/i18n';
import { Button, Callout, Checkbox, FilterChip, Input, PhoneField, Select, cn } from '@link/ui';
import { useI18n } from '../../i18n-client';

const GOVERNORATES = ['cairo', 'giza', 'alexandria', 'other'] as const;
const RANGES: CentreApplicationBody['hallRange'][] = ['1-3', '4-8', '9+'];
const STEPS = ['call', 'verify', 'live'] as const;
const POINTS = ['found', 'rooms', 'approve', 'followup'] as const;

/**
 * C01 · Add my centre (MKT-ACC-02 AC3): a request to join. Free to list; Link keeps a small fee
 * only on rent paid through Link (OD-01). Link calls, verifies, then the centre goes live — nothing
 * is published without the owner's approval. The consent box starts unticked (BR-CONSENT).
 */
export function AddCentre() {
  const { locale, t } = useI18n();
  const subjects = useQuery({
    queryKey: [...queryKeys.subjects(), locale],
    queryFn: () => api.subjects(),
  });
  const [f, setF] = useState({
    centreName: '',
    governorate: 'cairo' as (typeof GOVERNORATES)[number],
    area: '',
    address: '',
    ownerName: '',
    phone: '',
  });
  const [picked, setPicked] = useState<string[]>([]);
  const [range, setRange] = useState<CentreApplicationBody['hallRange']>('1-3');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setError(null);
  };
  const send = useMutation({
    mutationFn: () => {
      const national = normalizeEgyptPhone(f.phone);
      return marketApi.applyToJoin({
        ...f,
        governorate: t(`centre.join.gov.${f.governorate}`),
        phone: national ? `+20${national}` : '',
        subjects: picked,
        hallRange: range,
        consent,
      });
    },
    onError: (e) =>
      setError(
        e instanceof ApiError && e.code === 'consent_required'
          ? t('centre.join.consentNeeded')
          : e instanceof ApiError && e.code === 'validation_failed'
            ? t('centre.join.missing')
            : t('states.error.body'),
      ),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!f.centreName.trim() || !f.area.trim() || !f.address.trim() || !f.ownerName.trim())
      return setError(t('centre.join.missing'));
    if (!normalizeEgyptPhone(f.phone)) return setError(t('auth.phone.invalid'));
    if (!consent) return setError(t('centre.join.consentNeeded'));
    send.mutate();
  }

  return (
    <div className="mx-auto grid w-full max-w-[1200px] grid-cols-1 gap-10 px-4 py-10 lg:grid-cols-[1fr_560px] lg:py-14">
      <div className="flex flex-col gap-6">
        <p className="flex items-center gap-2 self-start rounded-full bg-white px-3 py-1.5 text-caption text-navy shadow-card">
          <span aria-hidden className="size-2 rounded-full bg-green" />
          {t('centre.join.badge')}
        </p>
        <h1 className="text-web-h2 text-navy">{t('centre.join.title')}</h1>
        <p className="text-web-body text-muted">{t('centre.join.lead')}</p>
        <ul className="flex flex-col gap-5">
          {POINTS.map((k) => (
            <li key={k} className="flex items-start gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-12 bg-blueSoft text-blueText">
                <CheckCircle2 aria-hidden className="size-5" />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-label text-navy">{t(`centre.join.point.${k}`)}</span>
                <span className="text-caption text-muted">{t(`centre.join.point.${k}Body`)}</span>
              </span>
            </li>
          ))}
        </ul>
        <ol className="grid grid-cols-1 gap-4 rounded-16 border border-border bg-white p-4 sm:grid-cols-3">
          {STEPS.map((k, i) => (
            <li key={k} className="flex items-center gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-navy text-caption text-white">
                {(i + 1).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en')}
              </span>
              <span className="flex flex-col">
                <span className="text-label text-navy">{t(`centre.join.step.${k}`)}</span>
                <span className="text-caption text-muted">{t(`centre.join.step.${k}Body`)}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <section className="flex flex-col gap-4 rounded-24 border border-border bg-white p-6 shadow-card sm:p-8">
        {send.isSuccess ? (
          <div className="flex flex-col gap-3" data-testid="join-done" role="status">
            <CheckCircle2 aria-hidden className="size-10 text-green" />
            <h2 className="text-title text-navy">{t('centre.join.doneTitle')}</h2>
            <p className="text-body text-muted">{t('centre.join.doneBody')}</p>
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
            <h2 className="text-title text-navy">{t('centre.join.formTitle')}</h2>
            <p className="text-caption text-muted">{t('centre.join.formLead')}</p>
            <Input
              label={t('centre.join.centreName')}
              value={f.centreName}
              onChange={(e) => set('centreName')(e.target.value)}
              data-testid="join-centre-name"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Select
                label={t('centre.join.governorate')}
                value={f.governorate}
                onChange={(e) => set('governorate')(e.target.value)}
                options={GOVERNORATES.map((g) => ({ value: g, label: t(`centre.join.gov.${g}`) }))}
              />
              <Input
                label={t('centre.join.area')}
                value={f.area}
                onChange={(e) => set('area')(e.target.value)}
                data-testid="join-area"
              />
            </div>
            <Input
              label={t('centre.join.address')}
              value={f.address}
              onChange={(e) => set('address')(e.target.value)}
              data-testid="join-address"
            />
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-label text-navy">{t('centre.join.subjects')}</legend>
              <div className="flex flex-wrap gap-2">
                {(subjects.data ?? []).map((s) => (
                  <FilterChip
                    key={s.id}
                    pressed={picked.includes(s.id)}
                    onPressedChange={(on) =>
                      setPicked((p) => (on ? [...p, s.id] : p.filter((x) => x !== s.id)))
                    }
                  >
                    {s.name}
                  </FilterChip>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-label text-navy">{t('centre.join.howManyRooms')}</legend>
              <div className="grid grid-cols-3 gap-2">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={range === r}
                    onClick={() => setRange(r)}
                    className={cn(
                      'min-h-11 rounded-12 border text-label',
                      range === r
                        ? 'border-navy bg-navy text-white'
                        : 'border-border bg-white text-navy',
                    )}
                  >
                    <bdi dir="ltr">{r}</bdi>
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input
                label={t('centre.join.ownerName')}
                value={f.ownerName}
                onChange={(e) => set('ownerName')(e.target.value)}
                data-testid="join-owner"
              />
              <PhoneField
                label={t('auth.phone.label')}
                value={f.phone}
                onChange={set('phone')}
                placeholder={t('auth.phone.placeholder')}
              />
            </div>
            <Checkbox checked={consent} onCheckedChange={setConsent}>
              {t('centre.join.consent')}
            </Checkbox>
            {error ? (
              <Callout tone="error" role="alert">
                {error}
              </Callout>
            ) : null}
            <Button type="submit" block disabled={send.isPending} data-testid="join-submit">
              {t('centre.join.submit')}
            </Button>
          </form>
        )}
      </section>
    </div>
  );
}
