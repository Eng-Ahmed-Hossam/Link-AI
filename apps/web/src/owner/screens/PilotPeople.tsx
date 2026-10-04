'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, pilotApi, type PilotPerson } from '@link/api-client';
import { Avatar, Button, Callout, Card, Checkbox, Input, Select, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { QueryState } from '../../parent/QueryState';
import { num } from '../common';

/**
 * A16 in the concierge pilot (A3): the owner adds people and sets their 6-digit PIN, which is shown
 * once here and never again (only a hash is kept). No phone numbers. Removing someone ends their
 * sessions at once; their past actions stay attributed in the activity history.
 */
export function PilotPeople() {
  const { locale, t } = useI18n();
  const { session } = useSession();
  const owner = session?.roles.includes('centre_owner');
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['pilot-users', locale], queryFn: pilotApi.users });
  const [name, setName] = useState('');
  const [role, setRole] = useState<PilotPerson['role'] | ''>('');
  const [groups, setGroups] = useState<string[]>([]);
  const [shown, setShown] = useState<{ name: string; pin: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roleLabel = (r: PilotPerson['role']) =>
    r === 'owner'
      ? t('owner.staff.roleOwner')
      : r === 'reception'
        ? t('owner.staff.roleReception')
        : t('owner.staff.roleTeacher');
  const allGroups = [
    ...new Map((q.data ?? []).flatMap((u) => u.groups).map((g) => [g.id, g])).values(),
  ];

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await qc.invalidateQueries();
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

  return (
    <>
      {shown ? (
        <Callout
          tone="success"
          title={t('owner.pilot.pinTitle', { name: shown.name })}
          role="status"
        >
          <span className="flex flex-col gap-1">
            <bdi dir="ltr" className="text-title tracking-widest text-navy" data-testid="shown-pin">
              {shown.pin}
            </bdi>
            {t('owner.pilot.pinOnce')}
          </span>
        </Callout>
      ) : null}
      <QueryState query={q}>
        {(people) => (
          <Card padding="none" className="overflow-hidden">
            <div className="p-5">
              <h2 className="text-heading text-navy">
                {t('owner.staff.count', { count: people.length, n: num(people.length, locale) })}
              </h2>
            </div>
            <table className="w-full">
              <thead className="bg-soft text-caption uppercase text-muted">
                <tr>
                  {[
                    t('owner.staff.colName'),
                    t('owner.staff.colRole'),
                    t('owner.staff.colScope'),
                    t('owner.pilot.colPin'),
                    t('owner.staff.colStatus'),
                    ...(owner ? [t('owner.pilot.colActions')] : []),
                  ].map((h) => (
                    <th key={h} scope="col" className="px-5 py-3 text-start font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id} className="border-t border-border" data-testid={`person-${p.id}`}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3 text-label">
                        <Avatar name={p.displayName} size="sm" />
                        <bdi>{p.displayName}</bdi>
                      </span>
                    </td>
                    <td className="px-5 py-3">{roleLabel(p.role)}</td>
                    <td className="px-5 py-3 text-body">
                      {p.groups.length
                        ? p.groups.map((g) => g.name).join(locale === 'ar' ? '، ' : ', ')
                        : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={p.hasPin ? 'success' : 'warning'}>
                        {p.hasPin ? t('owner.pilot.pinSet') : t('owner.pilot.pinNotSet')}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={p.active ? 'success' : 'neutral'}>
                        {p.active ? t('owner.staff.active') : t('owner.pilot.removed')}
                      </StatusBadge>
                    </td>
                    {owner ? (
                      <td className="px-5 py-3">
                        {p.active ? (
                          <span className="flex flex-wrap gap-2">
                            <Button
                              variant="secondary"
                              disabled={busy}
                              data-testid={`set-pin-${p.id}`}
                              onClick={() =>
                                run(async () => {
                                  const { pin } = await pilotApi.setPin(p.id);
                                  setShown({ name: p.displayName, pin });
                                })
                              }
                            >
                              {p.hasPin ? t('owner.pilot.newPin') : t('owner.pilot.setPin')}
                            </Button>
                            {p.id !== session?.userId ? (
                              confirmRemove === p.id ? (
                                <Button
                                  variant="quiet"
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      await pilotApi.removeUser(p.id);
                                      setConfirmRemove(null);
                                    })
                                  }
                                >
                                  {t('owner.pilot.confirmRemove')}
                                </Button>
                              ) : (
                                <Button variant="quiet" onClick={() => setConfirmRemove(p.id)}>
                                  {t('owner.pilot.remove')}
                                </Button>
                              )
                            ) : null}
                          </span>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </QueryState>
      {owner ? (
        <Card className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-heading text-navy">{t('owner.pilot.addTitle')}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label={t('owner.pilot.firstName')}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              data-testid="add-name"
            />
            <Select
              label={t('owner.staff.colRole')}
              placeholder={t('owner.outcome.choose')}
              value={role}
              onChange={(e) => setRole(e.target.value as PilotPerson['role'])}
              options={[
                { value: 'reception', label: t('owner.staff.roleReception') },
                { value: 'teacher', label: t('owner.staff.roleTeacher') },
                { value: 'owner', label: t('owner.staff.roleOwner') },
              ]}
              data-testid="add-role"
            />
          </div>
          {role === 'teacher' && allGroups.length ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-label text-navy">{t('owner.pilot.groupsTaught')}</legend>
              {allGroups.map((g) => (
                <Checkbox
                  key={g.id}
                  id={`grp-${g.id}`}
                  checked={groups.includes(g.id)}
                  onCheckedChange={(on) =>
                    setGroups((x) => (on ? [...x, g.id] : x.filter((y) => y !== g.id)))
                  }
                >
                  {g.name}
                </Checkbox>
              ))}
            </fieldset>
          ) : null}
          {error ? (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          ) : null}
          <Button
            className="self-start"
            disabled={busy || !name.trim() || !role}
            data-testid="add-person"
            onClick={() =>
              run(async () => {
                const r = await pilotApi.addUser({
                  name: name.trim(),
                  role: role as PilotPerson['role'],
                  groupIds: groups,
                });
                setShown({ name: r.user.displayName, pin: r.pin });
                setName('');
                setRole('');
                setGroups([]);
              })
            }
          >
            {t('owner.pilot.add')}
          </Button>
          <p className="text-caption text-muted">{t('owner.pilot.noPhones')}</p>
        </Card>
      ) : null}
    </>
  );
}
