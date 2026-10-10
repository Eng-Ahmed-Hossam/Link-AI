'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, newIdempotencyKey } from '@link/api-client';
import type { MessageKey } from '@link/i18n';
import { Button, Callout, Card, Input, Segmented, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { longDay } from '../common';
import { egp } from './shared';

/**
 * C07 · Where Link sends the centre's money (MKT-CEN-05, BR-OUT-03): the payout account (owner
 * only; Link re-checks it whenever it changes) and the last payouts (MKT-LED-08).
 */
export function PayoutCard({ centreId }: { centreId: string }) {
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const acc = useQuery({
    queryKey: ['centre-payout-account', centreId],
    queryFn: () => marketApi.centrePayoutAccount(centreId),
  });
  const history = useQuery({
    queryKey: ['centre-payouts', centreId],
    queryFn: () => marketApi.centrePayouts(centreId),
  });
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<'bank' | 'wallet'>('bank');
  const [number, setNumber] = useState('');
  const [holder, setHolder] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = acc.data?.account ?? null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await marketApi.putCentrePayoutAccount(
        centreId,
        { kind, number, holderName: holder },
        newIdempotencyKey(),
      );
      setEditing(false);
      setNumber('');
      await qc.invalidateQueries({ queryKey: ['centre-payout-account', centreId] });
    } catch (e) {
      setError(
        e instanceof ApiError && e.code === 'invalid_iban'
          ? t('teacher.money.invalidIban')
          : e instanceof ApiError && e.code === 'invalid_wallet'
            ? t('teacher.money.invalidWallet')
            : t('states.error.body'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="centre-payout-account">
      <h2 className="text-label text-navy">{t('teacher.money.accountTitle')}</h2>
      {a ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-body">
            {t(`teacher.money.kind.${a.kind}`)} <bdi dir="ltr">•••• {a.last4}</bdi>
            {a.holderName ? ` · ${a.holderName}` : ''}
          </span>
          <StatusBadge
            tone={a.status === 'verified' ? 'success' : a.status === 'failed' ? 'error' : 'info'}
          >
            {t(`teacher.money.accountStatus.${a.status}` as MessageKey)}
          </StatusBadge>
        </div>
      ) : (
        <p className="text-body text-muted">{t('teacher.money.noAccount')}</p>
      )}
      {a?.status === 'failed' ? (
        <Callout tone="error" role="alert">
          {t('teacher.money.fixAccount')}
        </Callout>
      ) : null}
      {editing ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Segmented
            label={t('teacher.money.accountTitle')}
            value={kind}
            onValueChange={(v) => setKind(v as 'bank' | 'wallet')}
            options={[
              { value: 'bank', label: t('teacher.money.kind.bank') },
              { value: 'wallet', label: t('teacher.money.kind.wallet') },
            ]}
          />
          <Input
            label={kind === 'bank' ? t('teacher.money.iban') : t('teacher.money.wallet')}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            ltr
            maxLength={40}
          />
          <Input
            label={t('teacher.money.holder')}
            value={holder}
            onChange={(e) => setHolder(e.target.value)}
            maxLength={80}
          />
          {error ? (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          ) : null}
          <p className="text-caption text-muted">{t('teacher.money.recheck')}</p>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={busy || number.trim().length < 8 || holder.trim().length < 2}
            >
              {t('teacher.money.saveAccount')}
            </Button>
            <Button type="button" variant="quiet" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setEditing(true)} data-testid="edit-payout">
          {a ? t('teacher.money.changeAccount') : t('teacher.money.addAccount')}
        </Button>
      )}
      {history.data?.length ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-caption text-muted">{t('teacher.money.historyTitle')}</h3>
          {history.data.slice(0, 8).map((p) => (
            <p key={p.id} className="flex justify-between gap-2 text-caption">
              <span>
                {longDay(p.on, locale)} · <bdi dir="ltr">{p.account}</bdi>
              </span>
              <span className="font-semibold">
                {egp(p.amount, locale)} ·{' '}
                {t(`teacher.money.payoutStatus.${p.status}` as MessageKey)}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
