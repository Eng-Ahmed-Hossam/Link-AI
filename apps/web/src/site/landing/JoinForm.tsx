'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Checkbox, WebArrow, webButtonClass } from '@link/ui';
import type { Locale } from '@link/i18n';
import { HONEYPOT, validatePilotRequest, type PilotField } from '../../pilot-request';
import type { JOIN_FORM_KEYS, Strings } from '../strings';

type Key = (typeof JOIN_FORM_KEYS)[number];

const ERR: Record<PilotField, Key> = {
  centre: 'landing.form.errCentre',
  contact: 'landing.form.errContact',
  phone: 'landing.form.errPhone',
  area: 'landing.form.errArea',
  teachers: 'landing.form.errTeachers',
  consent: 'landing.form.errConsent',
};

const label = 'text-[12px] font-semibold text-muted';
const input =
  'min-h-11 w-full rounded-12 border bg-bg px-3.5 py-3 text-[14px] text-navy placeholder:text-[#8a9ba8] focus:border-blue focus:outline-2 focus:outline-blue/30';

/**
 * Section 11's "Get started" form (Figma 77:698): name, centre, area, teachers, WhatsApp number.
 * It sends the same request as "Request a free pilot" (ADR-0009): checked here and on the server,
 * then emailed to the Link team; nothing is stored. Not in the Figma frame, kept for the law
 * (PDPL): the consent tick, which also says what the details are used for.
 */
export function JoinForm({
  locale,
  s,
  email,
}: {
  locale: Locale;
  s: Strings<typeof JOIN_FORM_KEYS>;
  /** Link's contact address and the confirmation sentence that carries it (when set). */
  email?: { address: string; line: string } | null;
}) {
  const t = (k: Key) => s[k];
  const [f, setF] = useState({
    contactName: '',
    centreName: '',
    area: '',
    teachers: '',
    phone: '',
    consent: false,
    [HONEYPOT]: '',
  });
  const [errors, setErrors] = useState<PilotField[]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'rate' | 'failed'>('idle');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const bad = (k: PilotField) => errors.includes(k);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, lang: locale };
    const v = validatePilotRequest(body);
    if (!v.ok && !f[HONEYPOT]) {
      setErrors(v.errors);
      document.getElementById(`join-${v.errors[0]}`)?.focus();
      return;
    }
    setErrors([]);
    setState('sending');
    try {
      const res = await fetch('/api/pilot-request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return setState('done');
      if (res.status === 429) return setState('rate');
      const p = (await res.json().catch(() => ({}))) as { errors?: PilotField[] };
      if (res.status === 400 && p.errors?.length) {
        setErrors(p.errors);
        return setState('idle');
      }
      setState('failed');
    } catch {
      setState('failed');
    }
  }

  const field = (
    id: PilotField,
    k: keyof typeof f,
    lab: Key,
    ph: Key,
    extra: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <label htmlFor={`join-${id}`} className={label}>
        {t(lab)}
      </label>
      <input
        id={`join-${id}`}
        value={f[k] as string}
        onChange={set(k)}
        placeholder={t(ph)}
        aria-invalid={bad(id) || undefined}
        aria-describedby={bad(id) ? `join-${id}-err` : undefined}
        required
        className={`${input} ${bad(id) ? 'border-red' : 'border-border'}`}
        {...extra}
      />
      {bad(id) ? (
        <p id={`join-${id}-err`} className="text-[12px] text-red">
          {t(ERR[id])}
        </p>
      ) : null}
    </div>
  );

  if (state === 'done')
    return (
      <div role="status" data-testid="pilot-done" className="flex flex-col items-start gap-3">
        <CheckCircle2 aria-hidden className="size-10 text-green" />
        <p className="text-[20px] leading-[1.32] font-bold text-navy">
          {t('landing.form.doneTitle')}
        </p>
        <p className="text-[14px] text-muted">{t('landing.form.doneBody')}</p>
        {email ? (
          <p className="text-[14px] text-muted" data-testid="pilot-done-email">
            {email.line.split(email.address)[0]}
            <a
              href={`mailto:${email.address}`}
              className="font-semibold text-blueText underline"
              dir="ltr"
            >
              {email.address}
            </a>
            {email.line.split(email.address)[1]}
          </p>
        ) : null}
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3.5" data-testid="pilot-form">
      <h3 className="text-[20px] leading-[1.32] font-bold tracking-[-0.01em] text-navy rtl:tracking-normal">
        {t('site.join.getStarted')}
      </h3>
      <p className="-mt-1 text-[13px] text-muted">{t('site.join.formSub')}</p>
      {field('contact', 'contactName', 'site.join.name', 'site.join.namePh', {
        autoComplete: 'name',
        maxLength: 80,
      })}
      <div className="flex flex-col gap-3 sm:flex-row">
        {field('centre', 'centreName', 'site.join.centre', 'site.join.centrePh', {
          autoComplete: 'organization',
          maxLength: 80,
        })}
        {field('area', 'area', 'site.join.area', 'site.join.areaPh', {
          autoComplete: 'address-level2',
          maxLength: 80,
        })}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {field('teachers', 'teachers', 'site.join.teachers', 'site.join.teachersPh', {
          inputMode: 'numeric',
          maxLength: 3,
        })}
        {field('phone', 'phone', 'site.join.phone', 'site.join.phone', {
          type: 'tel',
          inputMode: 'tel',
          autoComplete: 'tel',
          dir: 'ltr',
          maxLength: 20,
          placeholder: '+20 1xx xxx xxxx',
        })}
      </div>
      {/* Honeypot: hidden from people and screen readers; bots fill it. */}
      <div aria-hidden className="absolute -z-10 size-px overflow-hidden opacity-0">
        <label>
          {t('landing.form.honeypot')}
          <input
            tabIndex={-1}
            autoComplete="off"
            name={HONEYPOT}
            value={f[HONEYPOT]}
            onChange={set(HONEYPOT)}
          />
        </label>
      </div>
      <div id="join-consent" tabIndex={-1} className="text-[13px]">
        <Checkbox checked={f.consent} onCheckedChange={(v) => setF({ ...f, consent: v })}>
          {t('landing.form.consent')}
        </Checkbox>
        {bad('consent') ? (
          <p role="alert" className="mt-1 text-[12px] text-red">
            {t('landing.form.errConsent')}
          </p>
        ) : null}
      </div>
      {state === 'rate' || state === 'failed' ? (
        <p role="alert" className="rounded-12 bg-redSoft px-3.5 py-2.5 text-[13px] text-red">
          {t(state === 'rate' ? 'landing.form.errRate' : 'landing.form.errSend')}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={state === 'sending'}
        data-testid="pilot-submit"
        className={webButtonClass('primary', 'w-full disabled:opacity-70')}
      >
        {state === 'sending' ? t('landing.form.sending') : t('site.join.submit')}
        {state === 'sending' ? null : <WebArrow />}
      </button>
    </form>
  );
}
