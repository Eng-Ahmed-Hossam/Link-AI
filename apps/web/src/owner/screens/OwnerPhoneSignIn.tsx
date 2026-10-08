'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@link/api-client';
import { normalizeEgyptPhone } from '@link/i18n';
import { Button, Callout, OtpInput, PhoneField } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { isStaff } from '../common';

/**
 * A18 · Owner and staff sign-in by phone code (MKT-ACC-01, CF-02: phone OTP for everyone — Figma
 * shows email and password, CF-42). A number with no centre role is told so and pointed to "Add my
 * centre" (C01). Teachers use the mobile app.
 */
export function OwnerPhoneSignIn({ landing }: { landing: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { signIn } = useSession();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notStaff, setNotStaff] = useState(false);
  const national = normalizeEgyptPhone(phone);

  const errorText = (e: unknown) => {
    if (e instanceof ApiError) {
      if (e.isNetwork) return t('states.offline.body');
      switch (e.code) {
        case 'otp_invalid':
          return t('auth.otp.invalid', { remaining: Number(e.problem.remainingAttempts ?? 0) });
        case 'otp_locked':
          return t('auth.otp.locked');
        case 'otp_expired':
          return t('auth.otp.expired');
        case 'invalid_phone':
          return t('auth.phone.invalid');
        case 'rate_limited':
          return t('auth.otp.rateLimited');
      }
    }
    return t('states.error.body');
  };

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    if (!national) {
      setError(t('auth.phone.invalid'));
      return;
    }
    setBusy(true);
    try {
      await api.requestOtp(`+20${national}`);
      setStep('code');
      setCode('');
      setError(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(value = code) {
    if (value.length !== 6) return;
    setBusy(true);
    try {
      const r = await api.verifyOtp(`+20${national}`, value);
      if (!isStaff(r.user.roles)) {
        setNotStaff(true);
        return;
      }
      signIn({ accessToken: r.accessToken, userId: r.user.id, roles: r.user.roles });
      router.replace(landing);
    } catch (err) {
      setError(errorText(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  if (notStaff)
    return (
      <div className="flex flex-col gap-3" data-testid="not-staff">
        <Callout tone="warning">{t('owner.signIn.notStaff')}</Callout>
        <Link
          href={`/${locale}/add-your-centre`}
          className="inline-flex min-h-11 items-center justify-center rounded-12 bg-blue px-5 text-label text-navy shadow-glow"
        >
          {t('owner.signIn.addCentre')}
        </Link>
      </div>
    );

  return step === 'phone' ? (
    <form onSubmit={sendCode} className="flex flex-col gap-3" noValidate>
      <PhoneField
        label={t('auth.phone.label')}
        value={phone}
        onChange={(v) => {
          setPhone(v);
          setError(null);
        }}
        placeholder={t('auth.phone.placeholder')}
        error={error ?? undefined}
      />
      <Button type="submit" block disabled={busy} data-testid="owner-send-code">
        {busy ? t('common.loading') : t('owner.signIn.sendCode')}
      </Button>
    </form>
  ) : (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
      className="flex flex-col gap-3"
      noValidate
    >
      <p className="text-body text-navy">
        {t('auth.otp.sentTo')}{' '}
        <bdi dir="ltr" className="font-semibold">
          +20 {national}
        </bdi>
      </p>
      <OtpInput
        value={code}
        onChange={(v) => {
          setCode(v);
          if (v.length) setError(null);
        }}
        onComplete={(v) => void verify(v)}
        label={t('auth.otp.label')}
        digitLabel={(index, total) => t('auth.otp.digit', { index, total })}
        error={error ?? undefined}
        disabled={busy}
      />
      <Button type="submit" block disabled={busy || code.length !== 6} data-testid="owner-verify">
        {t('owner.signIn.signIn')}
      </Button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center self-start text-label text-blueText"
        onClick={() => {
          setStep('phone');
          setError(null);
        }}
      >
        {t('owner.signIn.changeNumber')}
      </button>
    </form>
  );
}
