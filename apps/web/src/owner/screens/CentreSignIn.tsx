'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ApiError, pilotApi } from '@link/api-client';
import { Button, Callout, Card, Input, Logo } from '@link/ui';
import { DevSignIn } from '@demo';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { useFlag } from '../../flags';
import { API_MODE, PILOT } from '../../api-mode';
import { isStaff, num } from '../common';
import { formatTime } from '@link/i18n';

const CENTRE = 'cen-nour';

/**
 * Centre workspace entry. Phone sign-in for owners (A18) is a Phase 1 screen (Batch 2, parked);
 * in mock modes this page offers the sample owner and Reception accounts (dev shortcut). The
 * concierge pilot signs in with the person's name and 6-digit PIN (A3).
 */
export function CentreSignIn() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { session, ready } = useSession();
  const followUp = useFlag('followup.owner_nav');
  const centre = session?.centreId ?? CENTRE;
  const landing = `/${locale}/centre/${centre}/${followUp ? 'today' : 'staff'}`;

  useEffect(() => {
    if (ready && isStaff(session?.roles)) router.replace(landing);
  }, [ready, session, landing, router]);

  return (
    <main id="main" className="flex min-h-dvh items-center justify-center bg-bg p-6">
      <Card padding="lg" className="flex w-full max-w-md flex-col gap-4">
        <Logo variant="lockup-light" size={32} label={t('common.appName')} />
        {PILOT ? (
          <PilotSignIn />
        ) : (
          <>
            <h1 className="text-title text-navy">{t('owner.signIn.title')}</h1>
            <Callout tone="info">{t('owner.signIn.pending')}</Callout>
            {API_MODE !== 'live' ? (
              <DevSignIn landing={landing} />
            ) : (
              <p className="text-body text-muted">{t('owner.signIn.liveUnavailable')}</p>
            )}
          </>
        )}
      </Card>
    </main>
  );
}

/** Pilot (A3): pick your name, enter your PIN. Teachers use the teacher app on their phone. */
function PilotSignIn() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const { signIn } = useSession();
  const info = useQuery({ queryKey: ['pilot-info'], queryFn: pilotApi.info });
  const people = useQuery({ queryKey: ['pilot-people', locale], queryFn: pilotApi.people });
  const staff = (people.data ?? []).filter((p) => p.role !== 'teacher');
  const [who, setWho] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roleLabel = {
    owner: t('owner.pilot.role.owner'),
    reception: t('owner.pilot.role.reception'),
    teacher: t('owner.pilot.role.teacher'),
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!who || !/^\d{6}$/.test(pin)) {
      setError(t('owner.pilot.pinShape'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await pilotApi.signIn(who, pin);
      const me = await pilotApi.me();
      signIn({
        accessToken: '',
        userId: me.id,
        roles: me.roles,
        centreId: me.centreId,
        name: me.name,
      });
      router.replace(`/${locale}/centre/${me.centreId}/today`);
    } catch (err) {
      const p = err instanceof ApiError ? err.problem : null;
      setPin('');
      if (p?.code === 'wrong_pin') {
        const left = Number((p as { attemptsLeft?: number }).attemptsLeft ?? 0);
        setError(t('owner.pilot.wrongPin', { count: left, n: num(left, locale) }));
      } else if (p?.code === 'locked')
        setError(
          t('owner.pilot.locked', {
            time: formatTime(String((p as { lockedUntil?: string }).lockedUntil), locale),
          }),
        );
      else if (p?.code === 'rate_limited') setError(t('owner.pilot.rateLimited'));
      else
        setError(
          t(err instanceof ApiError && err.isNetwork ? 'states.offline.body' : 'states.error.body'),
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <h1 className="text-title text-navy">
        {info.data
          ? t('owner.pilot.signInTitle', { centre: info.data.centreName })
          : t('owner.signIn.title')}
      </h1>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-label text-navy">{t('owner.pilot.whoAreYou')}</legend>
        {staff.map((p) => (
          <label
            key={p.id}
            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-12 border border-border px-3 has-[:checked]:border-blue has-[:checked]:bg-soft"
          >
            <input
              type="radio"
              name="who"
              value={p.id}
              checked={who === p.id}
              onChange={() => setWho(p.id)}
              data-testid={`pilot-person-${p.id}`}
            />
            <span className="text-body text-navy">
              <bdi>{p.displayName}</bdi> · {roleLabel[p.role]}
            </span>
          </label>
        ))}
        {people.isSuccess && !staff.length ? (
          <p className="text-body text-muted">{t('owner.pilot.noPeople')}</p>
        ) : null}
      </fieldset>
      <Input
        label={t('owner.pilot.pin')}
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        maxLength={6}
        value={pin}
        onChange={(e) =>
          setPin(
            e.target.value
              .replace(/[^\d٠-٩]/g, '')
              .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)),
          )
        }
        data-testid="pilot-pin"
        dir="ltr"
      />
      {error ? (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      ) : null}
      <Button type="submit" disabled={busy || !who} data-testid="pilot-sign-in">
        {t('owner.pilot.signIn')}
      </Button>
      <p className="text-caption text-muted">{t('owner.pilot.teacherHint')}</p>
      <p className="text-caption text-muted">{t('owner.pilot.forgotPin')}</p>
    </form>
  );
}
