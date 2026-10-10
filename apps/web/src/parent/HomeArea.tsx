'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, newIdempotencyKey, queryKeys, useMe } from '@link/api-client';
import { Button, Card, Select } from '@link/ui';
import { useI18n } from '../i18n-client';

/**
 * Home area (S3, MKT-DSC-01): where search measures from when the parent shares no location. Only
 * areas with a verified centre can be picked; "None" clears it. Stored on the guardian (a name,
 * never coordinates).
 */
export function HomeArea() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const me = useMe();
  const [areas, setAreas] = useState<{ name: string; governorate: string | null }[] | null>(null);
  const [value, setValue] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle');
  useEffect(() => {
    api
      .areas()
      .then(setAreas)
      .catch(() => setAreas([]));
  }, []);
  const current = me.data?.homeArea ?? '';
  const chosen = value ?? current;

  async function save() {
    setState('busy');
    try {
      await api.updateMe({ homeArea: chosen || null }, newIdempotencyKey());
      await qc.invalidateQueries({ queryKey: queryKeys.me });
      setValue(null);
      setState('saved');
    } catch {
      setState('error');
    }
  }

  return (
    <Card className="flex flex-col gap-3" data-testid="home-area">
      <h2 className="text-label text-navy">{t('parent.account.homeArea.title')}</h2>
      <p className="text-body text-muted">{t('parent.account.homeArea.lead')}</p>
      <Select
        label={t('parent.account.homeArea.label')}
        value={chosen}
        onChange={(e) => {
          setValue(e.target.value);
          setState('idle');
        }}
        options={[
          { value: '', label: t('parent.account.homeArea.none') },
          ...(areas ?? []).map((a) => ({
            value: a.name,
            label: a.governorate ? `${a.name} · ${a.governorate}` : a.name,
          })),
        ]}
        disabled={!areas}
        data-testid="home-area-select"
      />
      {state === 'saved' ? (
        <p role="status" className="text-caption text-green">
          {t('parent.account.homeArea.saved')}
        </p>
      ) : state === 'error' ? (
        <p role="alert" className="text-caption text-red">
          {t('states.error.body')}
        </p>
      ) : null}
      <Button
        variant="secondary"
        disabled={state === 'busy' || chosen === current}
        onClick={() => void save()}
        data-testid="home-area-save"
      >
        {t('parent.account.homeArea.save')}
      </Button>
    </Card>
  );
}
