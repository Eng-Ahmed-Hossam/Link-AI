'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { fuApi, type ParentMessage } from '@link/api-client';
import { Avatar, Callout, Card, EmptyState, FilterChip, StatusBadge } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dateTime, messageStatus, num, useCentre } from '../common';

type Filter = 'review' | 'approved' | 'awaiting' | 'issues';

/** A11 · Parent communication (FUP-MSG-06): reviewed messages linked to follow-ups. */
export function OwnerCommunication() {
  const { locale, t } = useI18n();
  const { base } = useCentre();
  const [filter, setFilter] = useState<Filter>('review');
  const q = useQuery({
    queryKey: ['messages', locale],
    queryFn: () => fuApi.messages(),
    refetchInterval: 3000,
  });
  const is: Record<Filter, (m: ParentMessage) => boolean> = {
    review: (m) => m.status === 'draft',
    approved: (m) => ['approved', 'queued', 'sent', 'delivered', 'read'].includes(m.status),
    awaiting: (m) => ['sent', 'delivered', 'read'].includes(m.status) && m.replies.length === 0,
    issues: (m) => m.status === 'failed' || m.status === 'not_sendable',
  };
  const labels: Record<Filter, string> = {
    review: t('owner.comm.review'),
    approved: t('owner.comm.approved'),
    awaiting: t('owner.comm.awaiting'),
    issues: t('owner.comm.issues'),
  };
  return (
    <>
      <OwnerPageHeader title={t('owner.comm.title')} subtitle={t('owner.comm.subtitle')} />
      <QueryState query={q}>
        {(d) => {
          const rows = [...d.data].reverse().filter(is[filter]);
          return (
            <>
              <div
                role="group"
                aria-label={t('owner.followUps.filters')}
                className="flex flex-wrap gap-2"
              >
                {(Object.keys(is) as Filter[]).map((f) => (
                  <FilterChip
                    key={f}
                    pressed={filter === f}
                    onPressedChange={() => setFilter(f)}
                    data-testid={`comm-${f}`}
                  >
                    {labels[f]} · {num(d.data.filter(is[f]).length, locale)}
                  </FilterChip>
                ))}
              </div>
              {rows.length ? (
                rows.map((m) => {
                  const st = messageStatus(t, m.status);
                  return (
                    <Card
                      key={m.id}
                      className="flex flex-col gap-3"
                      data-testid={`msg-row-${m.id}`}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <Avatar name={m.student.displayName} size="sm" tone="green" />
                        <h2 className="text-heading text-navy">
                          <bdi>{m.student.displayName}</bdi>
                        </h2>
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </div>
                      <p className="text-body text-navy">
                        {m.purpose} •{' '}
                        {m.channel === 'sms'
                          ? t('owner.msg.channelSms')
                          : t('owner.msg.channelWhatsApp')}{' '}
                        •{' '}
                        {m.replies.length
                          ? t('owner.comm.replied')
                          : m.approvedAt
                            ? dateTime(m.approvedAt, locale)
                            : t('owner.comm.notApproved')}
                      </p>
                      <div className="flex justify-end">
                        <Link
                          href={`${base}/messages/${m.id}`}
                          className="inline-flex min-h-11 items-center rounded-12 border border-border px-5 text-label text-navy"
                        >
                          {m.status === 'draft'
                            ? t('owner.comm.reviewDraft')
                            : t('owner.comm.open')}
                        </Link>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <EmptyState title={t('owner.comm.empty')} body={t('owner.comm.emptyBody')} />
              )}
              <Callout tone="info" title={t('owner.msg.notSolvingTitle')}>
                {t('owner.comm.notSolving')}
              </Callout>
            </>
          );
        }}
      </QueryState>
    </>
  );
}
