'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, opsApi } from '@link/api-client';
import { createTranslator, normalizeEgyptPhone, type Locale } from '@link/i18n';
import { Button, OtpInput, PhoneField } from '@link/ui';
import { useApiLocale } from './api';

/**
 * Ops sign-in by phone code, like every Link account (S2 brief; CF-60 records the change from
 * SSO). Only a `link_ops` account gets in, and only from an allowed network (OPS_IP_ALLOWLIST).
 */
export function OpsSignIn({ locale }: { locale: Locale }) {
  useApiLocale(locale);
  const t = createTranslator(locale);
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        case 'ops_permission_required':
          return t('ops.gate.notOps');
        case 'ops_ip_not_allowed':
          return t('ops.gate.ipNotAllowed');
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
      await api.verifyOtp(`+20${national}`, value);
      try {
        await opsApi.me();
      } catch (err) {
        // Signed in, but not an ops account (or not from here): end that session at once.
        await api.logout().catch(() => {});
        throw err;
      }
      router.replace(`/${locale}/centres`);
    } catch (err) {
      setError(errorText(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

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
      <Button type="submit" block disabled={busy} data-testid="ops-send-code">
        {busy ? t('common.loading') : t('ops.signIn.sendCode')}
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
      <Button type="submit" block disabled={busy || code.length !== 6} data-testid="ops-verify">
        {t('ops.signIn.signIn')}
      </Button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center self-start text-label text-blueText"
        onClick={() => {
          setStep('phone');
          setError(null);
        }}
      >
        {t('auth.otp.changeNumber')}
      </button>
    </form>
  );
}
