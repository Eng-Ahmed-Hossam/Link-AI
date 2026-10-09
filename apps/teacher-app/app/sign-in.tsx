import { useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { api, ApiError, setAuthToken, type Invite } from '@link/api-client';
import { normalizeEgyptPhone } from '@link/i18n';
import { Button, Callout, TextField, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { useSession } from '@/session';
import { SAMPLE_TEACHER } from '@/demo';
import { API_MODE, PILOT } from '@/api-mode';
import { PilotSignIn } from '@/screens/PilotSignIn';
import { Screen } from '@/ui/Screen';

/** Phone numbers and codes read left to right inside Arabic text (LTR isolate). */
const ltr = (s: string) => `⁦${s}⁩`;

/**
 * T14 · Sign in by phone code (MKT-ACC-01, CF-02): the number the centre registered, then the
 * 6-digit SMS code (5 minutes, 5 tries). Teachers join free and sign up themselves (CF-03). In mock
 * modes the code is 123456 and the sample teacher has a one-tap shortcut. The pilot signs in with
 * a name and PIN (A3).
 */
export default function SignIn() {
  if (PILOT) return <PilotSignIn />;
  return <PhoneSignIn />;
}

function PhoneSignIn() {
  const { locale, t, setLocale } = useLocale();
  const { signIn } = useSession();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A centre's invitation waiting for this teacher's accept (decided 2026-10-09).
  const [invite, setInvite] = useState<{
    invite: Invite;
    tokens: { accessToken: string; refreshToken?: string; userId: string };
  } | null>(null);
  const national = normalizeEgyptPhone(phone);
  // `/sign-in?sample=1` (the web dev index's one-click sign-in): straight in as the sample teacher.
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  useEffect(() => {
    if (sample === '1' && API_MODE !== 'live' && SAMPLE_TEACHER) {
      signIn(SAMPLE_TEACHER);
      router.replace('/');
    }
  }, [sample, signIn, router]);

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
      }
    }
    return t('states.error.body');
  };

  async function send() {
    if (!national) return setError(t('auth.phone.invalid'));
    setBusy(true);
    setError(null);
    try {
      await api.requestOtp(`+20${national}`);
      setStep('code');
      setCode('');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.verifyOtp(`+20${national}`, code);
      setAuthToken(r.accessToken ?? null);
      // CF-03: teachers join free and sign up themselves — a new number becomes a teacher here.
      const roles = r.isNewUser ? (await api.addRole('teacher')).roles : r.user.roles;
      if (!roles.includes('teacher')) {
        const pending = (await api.myInvites()).find((x) => x.role === 'teacher');
        if (pending) {
          setInvite({
            invite: pending,
            tokens: {
              accessToken: r.accessToken ?? '',
              refreshToken: r.refreshToken,
              userId: r.user.id,
            },
          });
          return;
        }
        setAuthToken(null);
        setError(t('teacher.signIn.notTeacher'));
        return;
      }
      signIn({
        accessToken: r.accessToken ?? '',
        refreshToken: r.refreshToken,
        userId: r.user.id,
      });
      router.replace('/');
    } catch (e) {
      setError(errorText(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  async function accept() {
    if (!invite) return;
    setBusy(true);
    try {
      await api.acceptInvite(invite.invite.id);
      signIn(invite.tokens);
      // The profile is hidden from parents until it has a name and a subject: J04 asks for them.
      router.replace('/profile');
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (invite)
    return (
      <Screen title={t('teacher.invite.title')} testID="screen-invite">
        <Text style={textStyle(locale, 'body')}>
          {t('teacher.invite.body', { centre: invite.invite.centre.name })}
        </Text>
        {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
        <Button
          locale={locale}
          label={t('teacher.invite.accept')}
          onPress={() => void accept()}
          disabled={busy}
          testID="accept-invite"
        />
      </Screen>
    );

  return (
    <Screen
      title={t('teacher.signIn.title')}
      subtitle={t('teacher.signIn.lead')}
      testID="screen-t14"
    >
      <TextField
        locale={locale}
        label={t('auth.phone.label')}
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setError(null);
        }}
        placeholder={t('auth.phone.placeholder')}
        keyboardType="phone-pad"
        autoComplete="tel"
        ltr
        editable={step === 'phone'}
        testID="t14-phone"
      />
      {step === 'code' ? (
        <TextField
          locale={locale}
          label={t('teacher.signIn.codeLabel')}
          value={code}
          onChangeText={(v) =>
            setCode(
              v
                .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
                .replace(/\D/g, '')
                .slice(0, 6),
            )
          }
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          maxLength={6}
          ltr
          testID="t14-code"
        />
      ) : null}
      {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
      {step === 'phone' ? (
        <Button
          locale={locale}
          label={t('teacher.signIn.sendCode')}
          onPress={() => void send()}
          disabled={busy}
          testID="t14-send"
        />
      ) : (
        <>
          <Button
            locale={locale}
            label={t('teacher.signIn.verify')}
            onPress={() => void verify()}
            disabled={busy || code.length !== 6}
            testID="t14-verify"
          />
          <Button
            locale={locale}
            variant="quiet"
            label={t('teacher.signIn.changeNumber')}
            onPress={() => {
              setStep('phone');
              setError(null);
            }}
          />
        </>
      )}
      <Callout locale={locale} tone="info" body={t('teacher.signIn.noAccount')} />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Button
          locale={locale}
          variant="quiet"
          label={locale === 'ar' ? t('common.languageSwitch.en') : t('common.languageSwitch.ar')}
          onPress={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        />
      </View>
      {API_MODE !== 'live' && SAMPLE_TEACHER ? (
        <View style={{ gap: space[8] }}>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.signIn.demoHint', { phone: ltr('+20 100 000 0002'), code: ltr('123456') })}
          </Text>
          <Button
            locale={locale}
            variant="secondary"
            testID="sign-in-sample"
            label={t('teacher.signIn.sample')}
            onPress={() => {
              signIn(SAMPLE_TEACHER!);
              router.replace('/');
            }}
          />
        </View>
      ) : null}
    </Screen>
  );
}
