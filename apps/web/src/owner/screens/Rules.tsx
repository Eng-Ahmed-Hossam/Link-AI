'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, ownerApi, type RuleView } from '@link/api-client';
import { normalizeDigits } from '@link/i18n';
import { Button, Callout, Card, Checkbox, Input, Select, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dateTime, num, useCentre } from '../common';

/**
 * A07 · Rules & settings (FUP-RUL-01, FUP-RUL-02). The four Phase 2 rules with parameters, defaults
 * (03 §3) and on/off; a plain-words example; scope per group or all groups; "Rule vN". The owner's
 * change applies as a new version; a staff change is a proposal until the owner approves it.
 */
export function OwnerRules() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const q = useQuery({
    queryKey: ['rules', centreId, locale],
    queryFn: () => ownerApi.rules(centreId),
  });
  return (
    <>
      <OwnerPageHeader title={t('owner.rules.title')} subtitle={t('owner.rules.subtitle')} />
      <QueryState query={q}>
        {(rules) => (
          <>
            {rules.map((r) => (
              <RuleCard key={`${r.code}-${r.version}-${r.proposal?.at ?? ''}-${locale}`} r={r} />
            ))}
          </>
        )}
      </QueryState>
    </>
  );
}

const PARAM_KEYS: Record<RuleView['code'], string[]> = {
  consecutive_absences: ['n'],
  score_decline: ['k', 'drop', 'minScores'],
  low_participation: ['k', 'm'],
  repeated_concern: ['count', 'windowDays'],
};

type T = ReturnType<typeof useI18n>['t'];
export const ruleName = (t: T, code: RuleView['code']) =>
  ({
    consecutive_absences: t('owner.rule.consecutive_absences'),
    score_decline: t('owner.rule.score_decline'),
    low_participation: t('owner.rule.low_participation'),
    repeated_concern: t('owner.rule.repeated_concern'),
  })[code];
const paramLabel = (t: T, k: string) =>
  ({
    n: t('owner.rules.param.n'),
    k: t('owner.rules.param.k'),
    drop: t('owner.rules.param.drop'),
    minScores: t('owner.rules.param.minScores'),
    m: t('owner.rules.param.m'),
    count: t('owner.rules.param.count'),
    windowDays: t('owner.rules.param.windowDays'),
  })[k] ?? k;

function RuleCard({ r }: { r: RuleView }) {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const { session } = useSession();
  const qc = useQueryClient();
  const owner = session?.roles.includes('centre_owner');
  const [active, setActive] = useState(r.active);
  const [params, setParams] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(r.params).map(([k, v]) => [k, String(v)])),
  );
  const [scope, setScope] = useState(r.scope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  useEffect(() => setActive(r.active), [r.active]);
  const changed =
    active !== r.active ||
    scope !== r.scope ||
    PARAM_KEYS[r.code].some((k) => Number(params[k]) !== r.params[k]);

  async function run(fn: () => Promise<unknown>, msg: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setDone(msg);
      await qc.invalidateQueries({ queryKey: ['rules'] });
    } catch (e) {
      setError(
        e instanceof ApiError
          ? (e.problem.detail ?? t('states.error.body'))
          : t('states.error.body'),
      );
    } finally {
      setBusy(false);
    }
  }
  const body = () => ({
    active,
    scope,
    params: Object.fromEntries(
      PARAM_KEYS[r.code].map((k) => [k, Number(normalizeDigits(params[k] ?? ''))]),
    ),
  });

  return (
    <Card className="flex flex-col gap-4" data-testid={`rule-${r.code}`}>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-heading text-navy">{ruleName(t, r.code)}</h2>
        <StatusBadge tone={r.active ? 'success' : 'neutral'}>
          {r.active ? t('owner.rules.on') : t('owner.rules.off')}
        </StatusBadge>
        <StatusBadge tone="info">
          {t('owner.rules.version', { v: num(r.version, locale) })}
        </StatusBadge>
      </div>
      <p className="text-body text-muted" data-testid={`rule-text-${r.code}`}>
        {r.text}
      </p>
      {r.code === 'score_decline' ? (
        <p className="text-caption text-muted">{t('owner.rules.scoreDeclineNote')}</p>
      ) : null}
      <Callout tone="info" title={t('owner.rules.example')}>
        {r.example}
      </Callout>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PARAM_KEYS[r.code].map((k) => (
          <Input
            key={k}
            label={paramLabel(t, k)}
            inputMode="numeric"
            value={params[k] ?? ''}
            onChange={(e) => setParams((p) => ({ ...p, [k]: e.target.value }))}
            data-testid={`param-${r.code}-${k}`}
          />
        ))}
        <Select
          label={t('owner.rules.scope')}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          options={[
            { value: 'all', label: t('owner.rules.allGroups') },
            { value: 'grp-salma-ws', label: t('owner.rules.demoGroup') },
          ]}
        />
      </div>
      <Checkbox id={`active-${r.code}`} checked={active} onCheckedChange={setActive}>
        {t('owner.rules.turnOn')}
      </Checkbox>
      {r.proposal ? (
        <Callout tone="warning" title={t('owner.rules.pending')} role="status">
          {t('owner.rules.pendingBody', {
            name: r.proposal.proposedBy.displayName,
            at: dateTime(r.proposal.at, locale),
          })}
          {owner ? (
            <span className="mt-2 flex flex-wrap gap-2">
              <Button
                data-testid={`approve-${r.code}`}
                disabled={busy}
                onClick={() =>
                  run(() => ownerApi.approveRule(centreId, r.code), t('owner.rules.approved'))
                }
              >
                {t('owner.rules.approve')}
              </Button>
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  run(() => ownerApi.rejectRule(centreId, r.code), t('owner.rules.rejected'))
                }
              >
                {t('owner.rules.reject')}
              </Button>
            </span>
          ) : null}
        </Callout>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          data-testid={`save-${r.code}`}
          disabled={busy || !changed}
          onClick={() =>
            run(
              () => ownerApi.changeRule(centreId, r.code, body()),
              owner ? t('owner.rules.saved') : t('owner.rules.proposed'),
            )
          }
        >
          {owner
            ? t('owner.rules.saveVersion', { v: num(r.version + 1, locale) })
            : t('owner.rules.propose')}
        </Button>
        {!owner ? (
          <span className="text-caption text-muted">{t('owner.rules.staffNote')}</span>
        ) : null}
      </div>
      {done ? (
        <p role="status" className="text-caption text-green">
          {done}
        </p>
      ) : null}
      {error ? (
        <Callout tone="error" role="alert">
          {error}
        </Callout>
      ) : null}
    </Card>
  );
}
