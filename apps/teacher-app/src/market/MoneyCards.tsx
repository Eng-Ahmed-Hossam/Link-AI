import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, newIdempotencyKey, type PaymentMethod } from '@link/api-client';
import type { MessageKey } from '@link/i18n';
import { Button, Callout, Card, StatusBadge, TextField, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { useLocale } from '@/locale';
import { track } from '@/net';
import { isolate, longDay } from '@/format';
import { egp } from './text';

/**
 * S3 money cards on J07: rent still owed after the 1st (OD-12, paid through Link: card, wallet or
 * Fawry), the payout account (re-verified by Link whenever it changes, BR-OUT-03) and the payout
 * history (MKT-LED-05). Amounts come from the server only.
 */
export function RentDueCard() {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['rent-due'], queryFn: () => track(marketApi.rentDue()) });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!q.data?.length) return null;
  async function pay(id: string, method: PaymentMethod) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await marketApi.payRent(id, method, newIdempotencyKey());
      if (r.kind === 'redirect') await Linking.openURL(r.checkoutUrl);
      else
        setMsg(
          t('teacher.money.fawryRef', {
            ref: isolate(r.fawryReference),
            until: longDay(r.expiresAt.slice(0, 10), locale),
          }),
        );
      await qc.invalidateQueries({ queryKey: ['rent-due'] });
    } catch (e) {
      setMsg(
        e instanceof ApiError && e.code === 'payments_off'
          ? t('teacher.money.paymentsOff')
          : t('states.error.body'),
      );
    } finally {
      setBusy(null);
    }
  }
  return (
    <Card testID="rent-due">
      <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
        {t('teacher.money.rentDueTitle')}
      </Text>
      <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
        {t('teacher.money.rentDueLead')}
      </Text>
      {q.data.map((r) => (
        <View key={r.id} style={styles.box}>
          <View style={styles.between}>
            <Text style={[textStyle(locale, 'label'), { flex: 1 }]}>
              {r.centre} · {r.hall}
            </Text>
            <StatusBadge
              locale={locale}
              tone={r.overdue ? 'error' : 'warning'}
              label={r.overdue ? t('teacher.money.overdue') : t('teacher.money.due')}
            />
          </View>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.money.rentLine', {
              rent: egp(r.rent, locale),
              paid: egp(r.paid, locale),
              date: r.dueOn ? longDay(r.dueOn, locale) : '—',
            })}
          </Text>
          <Text style={[textStyle(locale, 'heading'), { color: color.red }]}>
            {egp(r.due, locale)}
          </Text>
          <View style={styles.row}>
            <Button
              locale={locale}
              label={t('teacher.money.payCard')}
              disabled={busy === r.id}
              onPress={() => void pay(r.id, 'card')}
              testID="pay-rent-card"
            />
            <Button
              locale={locale}
              variant="secondary"
              label={t('teacher.money.payFawry')}
              disabled={busy === r.id}
              onPress={() => void pay(r.id, 'fawry')}
            />
          </View>
        </View>
      ))}
      {msg ? <Callout locale={locale} tone="info" body={msg} /> : null}
    </Card>
  );
}

export function PayoutAccountCard() {
  const { locale, t } = useLocale();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['payout-account'],
    queryFn: () => track(marketApi.myPayoutAccount()),
  });
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<'bank' | 'wallet'>('wallet');
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = q.data?.account ?? null;
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await marketApi.putMyPayoutAccount({ kind, number, holderName: holder }, newIdempotencyKey());
      setEditing(false);
      setNumber('');
      await qc.invalidateQueries({ queryKey: ['payout-account'] });
    } catch (e) {
      setError(
        e instanceof ApiError && (e.code === 'invalid_iban' || e.code === 'invalid_wallet')
          ? t(`teacher.money.${e.code === 'invalid_iban' ? 'invalidIban' : 'invalidWallet'}`)
          : t('states.error.body'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card testID="payout-account">
      <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
        {t('teacher.money.accountTitle')}
      </Text>
      {a ? (
        <View style={styles.between}>
          <Text style={[textStyle(locale, 'body'), { flex: 1 }]}>
            {t(`teacher.money.kind.${a.kind}`)} {isolate(`•••• ${a.last4}`)}
            {a.holderName ? ` · ${a.holderName}` : ''}
          </Text>
          <StatusBadge
            locale={locale}
            tone={a.status === 'verified' ? 'success' : a.status === 'failed' ? 'error' : 'info'}
            label={t(`teacher.money.accountStatus.${a.status}` as MessageKey)}
          />
        </View>
      ) : (
        <Text style={[textStyle(locale, 'body'), { color: color.muted }]}>
          {t('teacher.money.noAccount')}
        </Text>
      )}
      {a?.status === 'failed' ? (
        <Callout locale={locale} tone="error" role="alert" body={t('teacher.money.fixAccount')} />
      ) : null}
      {editing ? (
        <View style={{ gap: space[12] }}>
          <View style={styles.row}>
            {(['wallet', 'bank'] as const).map((k) => (
              <Button
                key={k}
                locale={locale}
                variant={kind === k ? 'primary' : 'secondary'}
                label={t(`teacher.money.kind.${k}`)}
                onPress={() => setKind(k)}
              />
            ))}
          </View>
          <TextField
            locale={locale}
            label={kind === 'bank' ? t('teacher.money.iban') : t('teacher.money.wallet')}
            value={number}
            onChangeText={setNumber}
            ltr
            autoCapitalize="characters"
            keyboardType={kind === 'wallet' ? 'phone-pad' : 'default'}
          />
          <TextField
            locale={locale}
            label={t('teacher.money.holder')}
            value={holder}
            onChangeText={setHolder}
          />
          {error ? <Callout locale={locale} tone="error" role="alert" body={error} /> : null}
          <Text style={[textStyle(locale, 'caption'), { color: color.muted }]}>
            {t('teacher.money.recheck')}
          </Text>
          <Button
            locale={locale}
            label={t('teacher.money.saveAccount')}
            disabled={busy || number.trim().length < 8 || holder.trim().length < 2}
            onPress={() => void save()}
            testID="save-payout-account"
          />
        </View>
      ) : (
        <Button
          locale={locale}
          variant="secondary"
          label={a ? t('teacher.money.changeAccount') : t('teacher.money.addAccount')}
          onPress={() => setEditing(true)}
          testID="edit-payout-account"
        />
      )}
    </Card>
  );
}

export function PayoutHistoryCard() {
  const { locale, t } = useLocale();
  const q = useQuery({ queryKey: ['my-payouts'], queryFn: () => track(marketApi.myPayouts()) });
  if (!q.data?.length) return null;
  return (
    <Card testID="payout-history">
      <Text accessibilityRole="header" style={textStyle(locale, 'heading')}>
        {t('teacher.money.historyTitle')}
      </Text>
      {q.data.map((p) => (
        <View key={p.id} style={styles.between}>
          <Text style={[textStyle(locale, 'caption'), { color: color.muted, flex: 1 }]}>
            {longDay(p.on, locale)} · {isolate(p.account)}
            {p.failureReason ? ` · ${p.failureReason}` : ''}
          </Text>
          <Text style={textStyle(locale, 'label')}>{egp(p.amount, locale)}</Text>
          <StatusBadge
            locale={locale}
            tone={p.status === 'settled' ? 'success' : p.status === 'failed' ? 'error' : 'info'}
            label={t(`teacher.money.payoutStatus.${p.status}` as MessageKey)}
          />
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  between: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space[8],
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[8] },
  box: {
    gap: space[8],
    padding: space[12],
    borderRadius: radius[12],
    backgroundColor: color.soft,
  },
});
