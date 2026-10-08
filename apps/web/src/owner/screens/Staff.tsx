'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  ownerApi,
  STAFF_PERMISSIONS,
  type StaffMember,
  type StaffPermission,
} from '@link/api-client';
import { normalizeEgyptPhone } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  Checkbox,
  Chip,
  Input,
  Select,
  StatusBadge,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { useSession } from '../../session';
import { useFlag } from '../../flags';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dateTime, num, useCentre } from '../common';
import { PILOT } from '../../api-mode';
import { PilotPeople } from './PilotPeople';

/**
 * A16 · Staff & access (FUP-STF-01, 10 §1). Phase 2 role matrix: owner (full access, rules, staff),
 * Reception (follow-ups, messages, all students read), teacher (own groups only). Whether teachers
 * see guardian phones is open (OD-25): hidden, pending. Marketplace part (MKT-ACC-06 AC1): a Reception
 * invite carries the permissions `bookings.manage` (room requests) and `reviews.reply` (10 §1).
 */
const PERMISSION_KEY = {
  'bookings.manage': 'owner.staff.permBookings',
  'reviews.reply': 'owner.staff.permReviews',
} as const;
export function OwnerStaff() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const { session } = useSession();
  const phase2 = useFlag('followup.owner_nav');
  const marketplace = useFlag('marketplace.enabled');
  const qc = useQueryClient();
  const owner = session?.roles.includes('centre_owner');
  const q = useQuery({
    queryKey: ['staff', centreId, locale],
    queryFn: () => ownerApi.staff(centreId),
    enabled: !PILOT,
  });
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffMember['role'] | ''>('');
  const [perms, setPerms] = useState<StaffPermission[]>([]);
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
      await ownerApi.invite(centreId, {
        phone: `+20${national}`,
        role,
        ...(marketplace && role === 'reception' ? { permissions: perms } : {}),
      });
      setPhone('');
      setRole('');
      setPerms([]);
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
      {PILOT ? <PilotPeople /> : null}
      {PILOT ? null : (
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
                      <td className="px-5 py-3 text-body">
                        <span className="flex flex-col gap-1">
                          {s.scope}
                          {marketplace && s.role === 'reception' && s.permissions?.length ? (
                            <span className="flex flex-wrap gap-1" data-testid="staff-perms">
                              {s.permissions.map((x) => (
                                <Chip key={x} tone="info">
                                  {t(PERMISSION_KEY[x])}
                                </Chip>
                              ))}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-body text-muted">
                        {s.lastActiveAt ? dateTime(s.lastActiveAt, locale) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge tone={s.status === 'active' ? 'success' : 'warning'}>
                          {s.status === 'active'
                            ? t('owner.staff.active')
                            : t('owner.staff.pending')}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </QueryState>
      )}
      {owner && !PILOT ? (
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
          {marketplace && role === 'reception' ? (
            <fieldset className="flex flex-col gap-2" data-testid="invite-perms">
              <legend className="mb-1 text-label text-navy">{t('owner.staff.permsTitle')}</legend>
              {STAFF_PERMISSIONS.map((x) => (
                <Checkbox
                  key={x}
                  checked={perms.includes(x)}
                  onCheckedChange={(on) =>
                    setPerms((p) => (on ? [...p, x] : p.filter((y) => y !== x)))
                  }
                >
                  {t(PERMISSION_KEY[x])}
                </Checkbox>
              ))}
            </fieldset>
          ) : null}
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
      {PILOT ? null : <Callout tone="warning">{t('owner.staff.phonesPending')}</Callout>}
    </>
  );
}
