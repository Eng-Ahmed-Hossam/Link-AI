'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Callout, Checkbox, Input, webButtonClass } from '@link/ui';
import type { Locale } from '@link/i18n';
import { HONEYPOT, validatePilotRequest, type PilotField } from '../pilot-request';
import type { PILOT_FORM_KEYS, Strings } from './strings';

const ERR: Record<PilotField, (typeof PILOT_FORM_KEYS)[number]> = {
  centre: 'landing.form.errCentre',
  contact: 'landing.form.errContact',
  phone: 'landing.form.errPhone',
  area: 'landing.form.errArea',
  teachers: 'landing.form.errTeachers',
  consent: 'landing.form.errConsent',
};

/**
 * "Request a free pilot" (path B): five fields and a consent tick, checked here and on the server,
 * then emailed to the Link team (ADR-0009). A hidden honeypot field catches bots.
 */
export function PilotForm({
  locale,
  s: words,
  centre = '',
  teachers = '',
  email,
}: {
  locale: Locale;
  s: Strings<typeof PILOT_FORM_KEYS>;
  centre?: string;
  teachers?: string;
  email?: { address: string; line: string } | null;
}) {
  const t = (k: keyof typeof words) => words[k];
  const [f, setF] = useState({
    centreName: centre,
    contactName: '',
    phone: '',
    area: '',
    teachers,
    consent: false,
    [HONEYPOT]: '',
  });
  const [errors, setErrors] = useState<PilotField[]>([]);
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'rate' | 'failed'>('idle');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });
  const err = (k: PilotField) => (errors.includes(k) ? t(ERR[k]) : undefined);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, lang: locale };
    const v = validatePilotRequest(body);
    if (!v.ok && !f[HONEYPOT]) {
      setErrors(v.errors);
      document.getElementById(`pilot-${v.errors[0]}`)?.focus();
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

  if (state === 'done')
    return (
      <div role="status" data-testid="pilot-done" className="flex flex-col items-start gap-4">
        <CheckCircle2 aria-hidden className="size-10 text-green" />
        <p className="text-web-h3 text-navy">{t('landing.form.doneTitle')}</p>
        <p className="text-web-body text-muted">{t('landing.form.doneBody')}</p>
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
        <Link
          prefetch={false}
          href={`/${locale}/try?${new URLSearchParams({ centre: f.centreName })}`}
          className={webButtonClass('outline')}
        >
          {t('landing.cta.try')}
        </Link>
      </div>
    );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" data-testid="pilot-form">
      <h2 className="text-web-h3 text-navy">{t('landing.form.title')}</h2>
      <Input
        id="pilot-centre"
        label={t('landing.form.centre')}
        value={f.centreName}
        onChange={set('centreName')}
        error={err('centre')}
        autoComplete="organization"
        maxLength={80}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          id="pilot-contact"
          label={t('landing.form.contact')}
          value={f.contactName}
          onChange={set('contactName')}
          error={err('contact')}
          autoComplete="name"
          maxLength={80}
          required
        />
        <Input
          id="pilot-phone"
          label={t('landing.form.phone')}
          help={t('landing.form.phoneHint')}
          value={f.phone}
          onChange={set('phone')}
          error={err('phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          ltr
          maxLength={20}
          required
        />
        <Input
          id="pilot-area"
          label={t('landing.form.area')}
          placeholder={t('landing.form.areaHint')}
          value={f.area}
          onChange={set('area')}
          error={err('area')}
          autoComplete="address-level2"
          maxLength={80}
          required
        />
        <Input
          id="pilot-teachers"
          label={t('landing.form.teachers')}
          value={f.teachers}
          onChange={set('teachers')}
          error={err('teachers')}
          inputMode="numeric"
          maxLength={3}
          required
        />
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
      <div id="pilot-consent" tabIndex={-1}>
        <Checkbox checked={f.consent} onCheckedChange={(v) => setF({ ...f, consent: v })}>
          {t('landing.form.consent')}
        </Checkbox>
        {err('consent') ? (
          <p role="alert" className="mt-1 text-caption text-red">
            {err('consent')}
          </p>
        ) : null}
      </div>
      {state === 'rate' || state === 'failed' ? (
        <Callout tone="error" role="alert">
          {t(state === 'rate' ? 'landing.form.errRate' : 'landing.form.errSend')}
        </Callout>
      ) : null}
      <button
        type="submit"
        disabled={state === 'sending'}
        data-testid="pilot-submit"
        className={webButtonClass('primary', 'w-full disabled:opacity-70')}
      >
        {state === 'sending' ? t('landing.form.sending') : t('landing.form.submit')}
      </button>
      <p className="text-caption text-muted">{t('landing.form.privacy')}</p>
    </form>
  );
}
