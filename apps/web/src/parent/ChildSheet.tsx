'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, queryKeys, useCurricula, type Child } from '@link/api-client';
import { Avatar, Button, Input, RadioCards, Select, Sheet } from '@link/ui';
import { useI18n } from '../i18n-client';

/**
 * Choose which child a search or reservation is for, or add a child (MKT-ACC-05: name,
 * curriculum and school year; nothing else is required).
 */
export function ChildSheet({
  open,
  onOpenChange,
  children,
  selectedId,
  onSelect,
  startWithAdd = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  children: Child[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  startWithAdd?: boolean;
}) {
  const { t } = useI18n();
  const [adding, setAdding] = useState(startWithAdd || children.length === 0);
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setAdding(startWithAdd || children.length === 0);
      }}
      title={adding ? t('parent.child.addTitle') : t('parent.child.chooseTitle')}
      closeLabel={t('common.close')}
    >
      {adding ? (
        <AddChildForm
          onDone={(c) => {
            onSelect(c.id);
            onOpenChange(false);
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <RadioCards
            label={t('parent.child.chooseTitle')}
            value={selectedId ?? undefined}
            onValueChange={(v) => {
              onSelect(v);
              onOpenChange(false);
            }}
            options={children.map((c) => ({
              value: c.id,
              leading: <Avatar name={c.displayName} size="sm" tone="green" />,
              title: <bdi>{c.displayName}</bdi>,
              description: `${c.curriculum.name} • ${c.schoolYear.name}`,
            }))}
          />
          <Button variant="secondary" onClick={() => setAdding(true)}>
            {t('parent.child.add')}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function AddChildForm({ onDone }: { onDone: (c: Child) => void }) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const curricula = useCurricula();
  const [name, setName] = useState('');
  const [curriculumId, setCurriculumId] = useState('');
  const [yearId, setYearId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const years = curricula.data?.find((c) => c.id === curriculumId)?.schoolYears ?? [];

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || !curriculumId || !yearId) {
          setError(t('parent.child.required'));
          return;
        }
        setBusy(true);
        try {
          const c = await api.addChild({
            displayName: name.trim(),
            curriculumId,
            schoolYearId: yearId,
          });
          await qc.invalidateQueries({ queryKey: queryKeys.children });
          onDone(c);
        } catch {
          setError(t('states.error.body'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Input
        label={t('parent.child.name')}
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoComplete="off"
      />
      <Select
        label={t('parent.child.curriculum')}
        value={curriculumId}
        placeholder={t('parent.child.choose')}
        onChange={(e) => {
          setCurriculumId(e.target.value);
          setYearId('');
        }}
        options={(curricula.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
      />
      <Select
        label={t('parent.child.year')}
        value={yearId}
        placeholder={t('parent.child.choose')}
        disabled={!curriculumId}
        onChange={(e) => setYearId(e.target.value)}
        options={years.map((y) => ({ value: y.id, label: y.name }))}
      />
      <p className="text-caption text-muted">{t('parent.child.consent')}</p>
      {error ? (
        <p role="alert" className="text-caption text-red">
          {error}
        </p>
      ) : null}
      <Button type="submit" block disabled={busy}>
        {busy ? t('common.loading') : t('parent.child.save')}
      </Button>
    </form>
  );
}
