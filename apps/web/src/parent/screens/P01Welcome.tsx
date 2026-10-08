'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError, setAuthToken, type Role } from '@link/api-client';
import { formatCountdown, normalizeEgyptPhone } from '@link/i18n';
import {
  Button,
  Callout,
  Logo,
  OtpInput,
  PageTitle,
  PhoneField,
  RadioCards,
  useSecondsLeft,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';

type SignupRole = Extract<Role, 'parent' | 'teacher' | 'centre_owner'>;

/**
 * P01 · Welcome & sign up (MKT-ACC-01, MKT-ACC-02). Phone OTP for everyone (CF-02): 6 digits,
 * 5-minute code, 5 tries, resend after 60 s. Roles: parent, teacher, centre owner (AC1).
 */
export function P01Welcome() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next');
  const signInOnly = params.get('mode') === 'sign-in';
  const { signIn } = useSession();

  const [role, setRole] = useState<SignupRole>('parent');
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendAt, setResendAt] = useState<string | null>(null);
  const resendLeft = useSecondsLeft(resendAt);
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
      const r = await api.requestOtp(`+20${national}`);
      setResendAt(new Date(Date.now() + r.resendAfterSeconds * 1000).toISOString());
      setStep('code');
      setCode('');
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
      let roles = r.user.roles;
      // MKT-ACC-02 AC2: one person can hold several roles; add the chosen one if new.
      if (!signInOnly && !roles.includes(role)) {
        setAuthToken(r.accessToken ?? null);
        roles = (await api.addRole(role)).roles;
      }
      signIn({ accessToken: r.accessToken ?? '', userId: r.user.id, roles });
      const chosen: SignupRole = signInOnly
        ? ((roles.find((x) => x !== 'centre_staff') as SignupRole) ?? 'parent')
        : role;
      // AC3: centre owner → join request (C01, Batch 2). AC4: teacher → teacher profile (teacher app).
      const dest =
        chosen === 'centre_owner'
          ? `/${locale}/add-your-centre`
          : chosen === 'teacher'
            ? `/${locale}/welcome/teacher`
            : (next ?? `/${locale}/search`);
      router.push(dest);
    } catch (err) {
      setError(errorText(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageTitle title={t('parent.welcome.title')} subtitle={t('parent.welcome.subtitle')} />

      {/* Link Assistant greeting card (navy). Blue is never text, so tile titles are white. */}
      <section
        aria-labelledby="hi"
        className="flex flex-col gap-3 rounded-24 bg-navy p-4 text-white shadow-raised"
      >
        <div className="flex items-center gap-3">
          {/* Halo version on a dark card: the exported halo PNG is opaque, so the ring is drawn here. */}
          <span className="rounded-full bg-blue/15 p-2">
            <Logo variant="mark" size={40} label="" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="hi" className="text-label">
              {t('parent.welcome.hiTitle')}
            </h2>
            <p className="text-caption text-white/75">{t('parent.welcome.hiBody')}</p>
          </div>
        </div>
        <ul className="flex gap-2">
          {(['near', 'verified', 'online'] as const).map((k) => (
            <li key={k} className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-12 bg-white/10 p-3">
              <span className="text-label">{t(`parent.welcome.tile.${k}.title`)}</span>
              <span className="text-caption text-white/80">
                {t(`parent.welcome.tile.${k}.body`)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {step === 'phone' ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3" noValidate>
          {!signInOnly ? (
            <>
              <h2 className="text-label text-navy">{t('parent.welcome.iAm')}</h2>
              <RadioCards
                label={t('parent.welcome.iAm')}
                value={role}
                onValueChange={(v) => setRole(v as SignupRole)}
                options={[
                  {
                    value: 'parent',
                    title: t('parent.welcome.role.parent'),
                    description: t('parent.welcome.role.parentDesc'),
                  },
                  {
                    value: 'teacher',
                    title: t('parent.welcome.role.teacher'),
                    description: t('parent.welcome.role.teacherDesc'),
                  },
                  {
                    value: 'centre_owner',
                    title: t('parent.welcome.role.owner'),
                    description: t('parent.welcome.role.ownerDesc'),
                  },
                ]}
              />
            </>
          ) : (
            <h2 className="text-heading text-navy">{t('parent.welcome.signInTitle')}</h2>
          )}
          <PhoneField
            label={t('auth.phone.label')}
            value={phone}
            onChange={(v) => {
              setPhone(v);
              setError(null);
            }}
            placeholder={t('auth.phone.placeholder')}
            help={t('auth.phone.help')}
            error={error ?? undefined}
          />
          <Button type="submit" block disabled={busy}>
            {busy ? t('common.loading') : t('parent.welcome.sendCode')}
          </Button>
          <p className="text-center text-caption text-muted">
            {signInOnly ? (
              <a
                className="text-blueText underline-offset-2 hover:underline"
                href={`/${locale}/welcome`}
              >
                {t('parent.welcome.newHere')}
              </a>
            ) : (
              <>
                {t('parent.welcome.haveAccount')}{' '}
                <a
                  className="inline-flex min-h-11 items-center text-blueText underline-offset-2 hover:underline"
                  href={`/${locale}/welcome?mode=sign-in${next ? `&next=${encodeURIComponent(next)}` : ''}`}
                >
                  {t('parent.welcome.signIn')}
                </a>
              </>
            )}
          </p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            verify();
          }}
          className="flex flex-col gap-4 rounded-16 border border-border bg-white p-4 shadow-card"
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
            onComplete={(v) => verify(v)}
            label={t('auth.otp.label')}
            digitLabel={(index, total) => t('auth.otp.digit', { index, total })}
            error={error ?? undefined}
            disabled={busy}
          />
          <Callout tone="neutral">{t('auth.otp.validity')}</Callout>
          <Button type="submit" block disabled={busy || code.length !== 6}>
            {busy ? t('common.loading') : t('auth.otp.verify')}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="quiet" onClick={() => setStep('phone')}>
              {t('auth.otp.changeNumber')}
            </Button>
            {resendLeft && resendLeft > 0 ? (
              <span className="text-caption text-muted" aria-live="off">
                {t('auth.otp.resendIn', { time: formatCountdown(resendLeft, locale) })}
              </span>
            ) : (
              <Button variant="quiet" onClick={() => sendCode()} disabled={busy}>
                {t('auth.otp.resend')}
              </Button>
            )}
          </div>
        </form>
      )}
    </>
  );
}
