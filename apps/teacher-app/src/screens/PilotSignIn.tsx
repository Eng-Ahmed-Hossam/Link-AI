import { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ApiError, pilotApi } from '@link/api-client';
import { formatNumber, formatTime } from '@link/i18n';
import { Button, Callout, Chip, TextField, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { useSession } from '@/session';
import { Screen } from '@/ui/Screen';

/**
 * Pilot sign-in (A3): the teacher picks their name and types their 6-digit PIN (set by the owner).
 * The server keeps the session; the phone only holds an httpOnly cookie — no PIN or token in storage.
 */
export function PilotSignIn() {
  const { locale, t } = useLocale();
  const router = useRouter();
  const { signIn } = useSession();
  const info = useQuery({ queryKey: ['pilot-info'], queryFn: pilotApi.info });
  const people = useQuery({ queryKey: ['pilot-people', locale], queryFn: pilotApi.people });
  const teachers = (people.data ?? []).filter((p) => p.role === 'teacher');
  const [who, setWho] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!who || !/^\d{6}$/.test(pin)) {
      setError(t('teacher.pilot.pinShape'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await pilotApi.signIn(who, pin);
      if (r.role !== 'teacher') {
        await pilotApi.signOut();
        setError(t('teacher.pilot.notTeacher'));
        return;
      }
      signIn({ accessToken: '', userId: r.id });
      router.replace('/');
    } catch (e) {
      const p = e instanceof ApiError ? e.problem : null;
      setPin('');
      if (p?.code === 'wrong_pin') {
        const left = Number((p as { attemptsLeft?: number }).attemptsLeft ?? 0);
        setError(t('owner.pilot.wrongPin', { count: left, n: formatNumber(left, locale) }));
      } else if (p?.code === 'locked')
        setError(
          t('owner.pilot.locked', {
            time: formatTime(String((p as { lockedUntil?: string }).lockedUntil), locale),
          }),
        );
      else if (p?.code === 'rate_limited') setError(t('owner.pilot.rateLimited'));
      else
        setError(
          t(e instanceof ApiError && e.isNetwork ? 'states.offline.body' : 'states.error.body'),
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      title={
        info.data
          ? t('owner.pilot.signInTitle', { centre: info.data.centreName })
          : t('teacher.signIn.title')
      }
    >
      <Text style={[textStyle(locale, 'label'), { color: color.navy }]}>
        {t('owner.pilot.whoAreYou')}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[8] }}>
        {teachers.map((p) => (
          <Chip
            key={p.id}
            locale={locale}
            label={p.displayName}
            selected={who === p.id}
            onPress={() => setWho(p.id)}
            testID={`pilot-person-${p.id}`}
          />
        ))}
      </View>
      {people.isSuccess && !teachers.length ? (
        <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
          {t('teacher.pilot.noTeachers')}
        </Text>
      ) : null}
      <TextField
        locale={locale}
        label={t('owner.pilot.pin')}
        value={pin}
        onChangeText={(v) =>
          setPin(
            v
              .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
              .replace(/\D/g, '')
              .slice(0, 6),
          )
        }
        secureTextEntry
        keyboardType="number-pad"
        maxLength={6}
        ltr
        testID="pilot-pin"
      />
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
      <Button
        locale={locale}
        label={t('owner.pilot.signIn')}
        onPress={submit}
        disabled={busy || !who}
        testID="pilot-sign-in"
      />
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {t('owner.pilot.forgotPin')}
      </Text>
    </Screen>
  );
}
