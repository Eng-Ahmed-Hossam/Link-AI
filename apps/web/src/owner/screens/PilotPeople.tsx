'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, pilotApi, type PilotPerson } from '@link/api-client';
import { Avatar, Button, Callout, Card, Checkbox, Input, Select, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { QueryState } from '../../parent/QueryState';
import { dateTime, num } from '../common';

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
  const vq = useQuery({ queryKey: ['pilot-voice'], queryFn: pilotApi.voiceStatus });
  const [name, setName] = useState('');
  const [role, setRole] = useState<PilotPerson['role'] | ''>('');
  const [groups, setGroups] = useState<string[]>([]);
  const [shown, setShown] = useState<{ name: string; pin: string } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmPause, setConfirmPause] = useState(false);
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
      {vq.data ? (
        <Card data-testid="voice-card">
          <div className="flex flex-col gap-3">
            <h2 className="text-heading text-navy">{t('owner.pilot.voiceCardTitle')}</h2>
            {!vq.data.available ? (
              <p className="text-body text-muted" data-testid="voice-unavailable">
                {t('owner.pilot.voiceUnavailable')}
              </p>
            ) : (
              <>
                <p className="text-body" data-testid="voice-profile">
                  {vq.data.profile
                    ? t('owner.pilot.voiceProfile', {
                        profile: t(
                          vq.data.profile.key === 'gpu'
                            ? 'owner.pilot.profileGpu'
                            : vq.data.profile.key === 'cpu_rules'
                              ? 'owner.pilot.profileCpuRules'
                              : 'owner.pilot.profileCpuLlm',
                        ),
                        seconds: num(vq.data.profile.secondsPerMinute, locale),
                      })
                    : t('owner.pilot.profileUnknown')}
                </p>
                <p className="text-body text-muted">{t('owner.pilot.voicePerTeacher')}</p>
                <p className="text-body text-muted">{t('owner.pilot.voiceScoresCheck')}</p>
                {vq.data.paused ? (
                  <Callout tone="warning" role="status">
                    <span data-testid="voice-paused">
                      {t('owner.pilot.voicePausedBody', {
                        date: vq.data.pausedAt ? dateTime(vq.data.pausedAt, locale) : '',
                      })}
                    </span>
                  </Callout>
                ) : null}
                {owner ? (
                  vq.data.paused ? (
                    <div>
                      <Button
                        variant="secondary"
                        disabled={busy}
                        data-testid="voice-kill-switch"
                        onClick={() => run(() => pilotApi.setVoicePaused(false))}
                      >
                        {t('owner.pilot.voiceResumeAll')}
                      </Button>
                    </div>
                  ) : confirmPause ? (
                    <Callout tone="warning" title={t('owner.pilot.voicePauseConfirmTitle')}>
                      <span className="flex flex-col gap-3">
                        {t('owner.pilot.voicePauseConfirmBody')}
                        <span className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            danger
                            disabled={busy}
                            data-testid="voice-kill-confirm"
                            onClick={() =>
                              run(async () => {
                                await pilotApi.setVoicePaused(true);
                                setConfirmPause(false);
                              })
                            }
                          >
                            {t('owner.pilot.voicePauseAll')}
                          </Button>
                          <Button variant="quiet" onClick={() => setConfirmPause(false)}>
                            {t('common.cancel')}
                          </Button>
                        </span>
                      </span>
                    </Callout>
                  ) : (
                    <div>
                      <Button
                        variant="secondary"
                        danger
                        disabled={busy}
                        data-testid="voice-kill-switch"
                        onClick={() => setConfirmPause(true)}
                      >
                        {t('owner.pilot.voicePauseAll')}
                      </Button>
                    </div>
                  )
                ) : null}
              </>
            )}
          </div>
        </Card>
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
                    t('owner.pilot.colVoice'),
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
                    <td className="px-5 py-3" data-testid={`voice-${p.id}`}>
                      {p.role !== 'teacher' ? (
                        '—'
                      ) : (
                        <span className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={p.voiceConsent ? 'success' : 'neutral'}>
                            {p.voiceConsent
                              ? p.voiceConsentAt
                                ? t('owner.pilot.voiceSignedOn', {
                                    date: dateTime(p.voiceConsentAt, locale),
                                  })
                                : t('owner.pilot.voiceSigned')
                              : t('owner.pilot.voiceNone')}
                          </StatusBadge>
                          <span data-testid={`voice-state-${p.id}`}>
                            <StatusBadge
                              tone={p.voiceOn && !vq.data?.paused ? 'success' : 'neutral'}
                            >
                              {p.voiceOn && !vq.data?.paused
                                ? t('owner.pilot.voiceOn')
                                : t('owner.pilot.voiceOff')}
                            </StatusBadge>
                          </span>
                          {owner && p.active ? (
                            <Button
                              variant="quiet"
                              disabled={busy}
                              data-testid={`voice-toggle-${p.id}`}
                              onClick={() =>
                                run(() => pilotApi.setVoiceConsent(p.id, !p.voiceConsent))
                              }
                            >
                              {p.voiceConsent
                                ? t('owner.pilot.voiceWithdraw')
                                : t('owner.pilot.voiceGrant')}
                            </Button>
                          ) : null}
                          {owner && p.active && vq.data?.available ? (
                            <Button
                              variant="secondary"
                              disabled={busy || (!p.voiceOn && !p.voiceConsent)}
                              title={
                                !p.voiceConsent ? t('owner.pilot.voiceNeedsConsent') : undefined
                              }
                              data-testid={`voice-switch-${p.id}`}
                              onClick={() => run(() => pilotApi.setTeacherVoice(p.id, !p.voiceOn))}
                            >
                              {p.voiceOn
                                ? t('owner.pilot.voiceTurnOff')
                                : t('owner.pilot.voiceTurnOn')}
                            </Button>
                          ) : null}
                        </span>
                      )}
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
