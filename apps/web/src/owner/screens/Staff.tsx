'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, ownerApi, type StaffMember } from '@link/api-client';
import { normalizeEgyptPhone } from '@link/i18n';
import { Avatar, Button, Callout, Card, Input, Select, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { useFlag } from '../../flags';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dateTime, num, useCentre } from '../common';

/**
 * A16 · Staff & access (FUP-STF-01, 10 §1). Phase 2 role matrix: owner (full access, rules, staff),
 * Reception (follow-ups, messages, all students read), teacher (own groups only). Whether teachers
 * see guardian phones is open (OD-25): hidden, pending.
 */
export function OwnerStaff() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const { session } = useSession();
  const phase2 = useFlag('followup.owner_nav');
  const qc = useQueryClient();
  const owner = session?.roles.includes('centre_owner');
  const q = useQuery({
    queryKey: ['staff', centreId, locale],
    queryFn: () => ownerApi.staff(centreId),
  });
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffMember['role'] | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const roleLabel = (r: StaffMember['role']) =>
    r === 'owner'
      ? t('owner.staff.roleOwner')
      : r === 'reception'
        ? t('owner.staff.roleReception')
        : t('owner.staff.roleTeacher');

  async function invite() {
    const national = normalizeEgyptPhone(phone);
    if (!national || !role) {
      setError(t('owner.staff.needPhoneRole'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ownerApi.invite(centreId, { phone: `+20${national}`, role });
      setPhone('');
      setRole('');
      await qc.invalidateQueries({ queryKey: ['staff'] });
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

  const matrix: { role: StaffMember['role']; title: string; items: string[] }[] = [
    {
      role: 'owner',
      title: t('owner.staff.ownerTitle'),
      items: [t('owner.staff.ownerA'), t('owner.staff.ownerB'), t('owner.staff.ownerC')],
    },
    {
      role: 'reception',
      title: t('owner.staff.receptionTitle'),
      items: [
        t('owner.staff.receptionA'),
        t('owner.staff.receptionB'),
        t('owner.staff.receptionC'),
      ],
    },
    {
      role: 'teacher',
      title: t('owner.staff.teacherTitle'),
      items: [t('owner.staff.teacherA'), t('owner.staff.teacherB'), t('owner.staff.teacherC')],
    },
  ];

  return (
    <>
      <OwnerPageHeader title={t('owner.staff.title')} subtitle={t('owner.staff.subtitle')} />
      {phase2 ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3" data-testid="role-matrix">
          {matrix.map((m) => (
            <Card key={m.role} className="flex flex-col gap-2">
              <StatusBadge
                tone={m.role === 'owner' ? 'neutral' : m.role === 'reception' ? 'info' : 'success'}
                className="self-start"
              >
                {roleLabel(m.role)}
              </StatusBadge>
              <p className="text-label text-navy">{m.title}</p>
              <ul className="flex flex-col gap-1 text-caption text-muted">
                {m.items.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      ) : null}
      <QueryState query={q}>
        {(staff) => (
          <Card padding="none" className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 p-5">
              <h2 className="text-heading text-navy">
                {t('owner.staff.count', { count: staff.length, n: num(staff.length, locale) })}
              </h2>
            </div>
            <table className="w-full">
              <thead className="bg-soft text-caption uppercase text-muted">
                <tr>
                  {[
                    t('owner.staff.colName'),
                    t('owner.staff.colRole'),
                    t('owner.staff.colScope'),
                    t('owner.staff.colLast'),
                    t('owner.staff.colStatus'),
                  ].map((h) => (
                    <th key={h} scope="col" className="px-5 py-3 text-start font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.user.id} className="border-t border-border">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-3 text-label">
                        <Avatar name={s.user.displayName} size="sm" />
                        <bdi>{s.user.displayName}</bdi>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        tone={
                          s.role === 'owner'
                            ? 'neutral'
                            : s.role === 'reception'
                              ? 'info'
                              : 'success'
                        }
                      >
                        {roleLabel(s.role)}
                      </StatusBadge>
                    </td>
                    <td className="px-5 py-3 text-body">{s.scope}</td>
                    <td className="px-5 py-3 text-body text-muted">
                      {s.lastActiveAt ? dateTime(s.lastActiveAt, locale) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge tone={s.status === 'active' ? 'success' : 'warning'}>
                        {s.status === 'active' ? t('owner.staff.active') : t('owner.staff.pending')}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </QueryState>
      {owner ? (
        <Card className="flex max-w-3xl flex-col gap-3">
          <h2 className="text-heading text-navy">{t('owner.staff.invite')}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Input
              label={t('owner.staff.phone')}
              ltr
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              data-testid="invite-phone"
            />
            <Select
              label={t('owner.staff.colRole')}
              placeholder={t('owner.outcome.choose')}
              value={role}
              onChange={(e) => setRole(e.target.value as StaffMember['role'])}
              options={[
                { value: 'reception', label: t('owner.staff.roleReception') },
                { value: 'teacher', label: t('owner.staff.roleTeacher') },
              ]}
            />
          </div>
          {error ? (
            <Callout tone="error" role="alert">
              {error}
            </Callout>
          ) : null}
          <Button data-testid="send-invite" className="self-start" disabled={busy} onClick={invite}>
            {t('owner.staff.sendInvite')}
          </Button>
          <p className="text-caption text-muted">{t('owner.staff.inviteNote')}</p>
        </Card>
      ) : null}
      <Callout tone="warning">{t('owner.staff.phonesPending')}</Callout>
    </>
  );
}
