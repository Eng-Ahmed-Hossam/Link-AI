'use client';

import { useState } from 'react';
import { Callout, Input, RadioCards, webButtonClass } from '@link/ui';
import type { Locale } from '@link/i18n';
import type { TryRole } from '@demo';
import { toAsciiDigits } from '../pilot-request';
import type { Strings, TRY_FORM_KEYS } from './strings';

/**
 * "Try Link with your centre" (path A): centre name, role, optionally the number of teachers.
 * The demo opens at once in this browser under that name (src/demo/try.ts).
 */
export function TryForm({
  locale,
  s: words,
  centre = '',
}: {
  locale: Locale;
  s: Strings<typeof TRY_FORM_KEYS>;
  centre?: string;
}) {
  const t = (k: keyof typeof words) => words[k];
  const [name, setName] = useState(centre);
  const [role, setRole] = useState<TryRole | undefined>();
  const [teachers, setTeachers] = useState('');
  const [errors, setErrors] = useState<{ centre?: boolean; role?: boolean }>({});
  const [busy, setBusy] = useState(false);

  const [unavailable, setUnavailable] = useState(false);
  if (unavailable) return <Callout tone="info">{t('landing.try.unavailable')}</Callout>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const centreName = name.replace(/\s+/g, ' ').trim();
    const bad = { centre: centreName.length < 2 || centreName.length > 60, role: !role };
    setErrors(bad);
    if (bad.centre || bad.role) {
      document.getElementById(bad.centre ? 'try-centre' : 'try-role')?.focus();
      return;
    }
    setBusy(true);
    const n = Number(toAsciiDigits(teachers).trim());
    // The demo code loads only now (it carries the sample data); the pilot build has none.
    const { startTry } = await import('@demo');
    if (!startTry) return setUnavailable(true);
    const href = await startTry({
      centreName,
      role: role!,
      teachers: Number.isInteger(n) && n > 0 && n <= 500 ? n : null,
      lang: locale,
    });
    // A full page load: the app (and its in-browser backend) starts fresh on the demo.
    window.location.assign(href);
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5" data-testid="try-form">
      <Input
        id="try-centre"
        label={t('landing.try.centre')}
        placeholder={t('landing.try.centreHint')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.centre ? t('landing.try.errCentre') : undefined}
        maxLength={60}
        autoComplete="organization"
        required
      />
      <div id="try-role" tabIndex={-1} className="flex flex-col gap-2">
        <p className="text-label text-navy">{t('landing.try.role')}</p>
        <RadioCards
          label={t('landing.try.role')}
          value={role ?? ''}
          onValueChange={(v) => setRole(v as TryRole)}
          options={(['owner', 'reception', 'teacher'] as const).map((r) => ({
            value: r,
            title: t(`landing.try.${r}`),
            description: t(`landing.try.${r}Desc`),
          }))}
        />
        {errors.role ? (
          <p role="alert" className="text-caption text-red">
            {t('landing.try.errRole')}
          </p>
        ) : null}
      </div>
      <Input
        id="try-teachers"
        label={t('landing.try.teachers')}
        value={teachers}
        onChange={(e) => setTeachers(e.target.value)}
        inputMode="numeric"
        maxLength={3}
      />
      <button
        type="submit"
        disabled={busy}
        data-testid="try-submit"
        className={webButtonClass('primary', 'w-full disabled:opacity-70')}
      >
        {busy ? t('landing.try.opening') : t('landing.try.submit')}
      </button>
      <p className="text-caption text-muted">{t('landing.try.note')}</p>
    </form>
  );
}
