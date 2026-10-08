'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, marketApi, type ReviewReceived, type ReviewTab } from '@link/api-client';
import { Button, Callout, Card, Chip, KpiCard, Textarea, cn } from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../../parent/QueryState';
import { OwnerPageHeader, dayMonth, num, useCentre } from '../common';

const TABS: ReviewTab[] = ['public', 'private', 'reported'];

/**
 * C04 · Reviews & private feedback (MKT-REV-03): public reviews, private notes and reported
 * reviews. Owners reply publicly or report — never delete or hide (BR-REV-06). Only verified
 * parents of enrolled students can review (BR-REV-01).
 */
export function CentreReviews() {
  const { locale, t } = useI18n();
  const { centreId } = useCentre();
  const [tab, setTab] = useState<ReviewTab>('public');
  const q = useQuery({
    queryKey: ['reviews-received', centreId, tab, locale],
    queryFn: () => marketApi.reviewsReceived(centreId, tab),
  });
  const stars = (n: number) => num(n, locale);

  return (
    <>
      <OwnerPageHeader title={t('centre.reviews.title')} subtitle={t('centre.reviews.subtitle')} />
      <QueryState query={q} loadingRows={4}>
        {(d) => (
          <>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <KpiCard
                testId="kpi-centre-rating"
                value={`★ ${stars(d.summary.centre.rating)}`}
                label={t('centre.reviews.centreRating')}
                context={t('centre.reviews.publicCount', {
                  count: d.summary.centre.count,
                  n: num(d.summary.centre.count, locale),
                })}
              />
              {d.summary.teachers.slice(0, 2).map((tc) => (
                <KpiCard
                  key={tc.name}
                  value={`★ ${stars(tc.rating)}`}
                  label={<bdi>{tc.name}</bdi>}
                  context={t('centre.reviews.count', { count: tc.count, n: num(tc.count, locale) })}
                />
              ))}
              <KpiCard
                testId="kpi-private"
                value={num(d.summary.privateThisMonth, locale)}
                label={t('centre.reviews.privateNotes')}
              />
            </div>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_320px]">
              <div className="flex flex-col gap-4">
                <div
                  role="tablist"
                  aria-label={t('centre.reviews.title')}
                  className="flex flex-wrap gap-1 self-start rounded-12 bg-soft p-1"
                >
                  {TABS.map((x) => (
                    <button
                      key={x}
                      type="button"
                      role="tab"
                      aria-selected={tab === x}
                      data-testid={`tab-${x}`}
                      onClick={() => setTab(x)}
                      className={cn(
                        'min-h-11 rounded-8 px-4 text-label',
                        tab === x ? 'bg-white text-navy shadow-card' : 'text-muted',
                      )}
                    >
                      {t('centre.reviews.tabCount', {
                        label: t(`centre.reviews.tab.${x}`),
                        n: num(d.counts[x], locale),
                      })}
                    </button>
                  ))}
                </div>
                {d.items.length ? (
                  d.items.map((r) => <ReviewCard key={r.id} r={r} />)
                ) : (
                  <Callout tone="info">{t('centre.reviews.empty')}</Callout>
                )}
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 rounded-16 bg-navy p-5 text-white">
                  <h2 className="text-label">{t('centre.reviews.howTitle')}</h2>
                  <ul className="flex list-disc flex-col gap-1 ps-4 text-caption text-white/80">
                    {(['how1', 'how2', 'how3', 'how4'] as const).map((k) => (
                      <li key={k}>{t(`centre.reviews.${k}`)}</li>
                    ))}
                  </ul>
                </div>
                {d.mentions.length ? (
                  <Card className="flex flex-col gap-2">
                    <h2 className="text-label text-navy">{t('centre.reviews.mentions')}</h2>
                    {d.mentions.map((m) => (
                      <p key={m.tag} className="flex justify-between text-caption text-navy">
                        <span>{t(`parent.tag.${m.tag}` as 'parent.tag.communication')}</span>
                        <span className="text-muted">{num(m.count, locale)}</span>
                      </p>
                    ))}
                  </Card>
                ) : null}
              </div>
            </div>
          </>
        )}
      </QueryState>
    </>
  );
}

function ReviewCard({ r }: { r: ReviewReceived }) {
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const { centreId } = useCentre();
  const [mode, setMode] = useState<'reply' | 'report' | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: () =>
      mode === 'reply' ? marketApi.replyReview(r.id, text) : marketApi.reportReview(r.id, text),
    onSuccess: () => {
      setMode(null);
      setText('');
      void qc.invalidateQueries({ queryKey: ['reviews-received', centreId] });
    },
    onError: (e) =>
      setError(e instanceof ApiError ? (e.problem.detail ?? e.message) : t('states.error.title')),
  });
  return (
    <Card className="flex flex-col gap-3" data-testid={`review-${r.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-label={t('centre.reviews.stars', { n: r.stars })} className="text-amber">
            {'★'.repeat(r.stars)}
            <span className="text-border">{'★'.repeat(5 - r.stars)}</span>
          </span>
          <Chip>
            {t('centre.reviews.about', {
              name: r.target.kind === 'centre' ? t('centre.reviews.theCentre') : r.target.name,
            })}
          </Chip>
          {r.visibility === 'private' ? (
            <Chip tone="warning">{t('centre.reviews.privateChip')}</Chip>
          ) : null}
        </div>
        <span className="text-caption text-muted">
          {t('centre.reviews.verified', {
            year: r.schoolYear,
            date: dayMonth(r.createdAt.slice(0, 10), locale),
          })}
        </span>
      </div>
      <p className="text-body text-navy">{r.body}</p>
      {r.reply ? (
        <div className="rounded-12 bg-blueSoft p-3" data-testid="review-reply">
          <p className="text-caption font-semibold text-blueText">
            {t('centre.reviews.yourReply')}
          </p>
          <p className="text-caption text-navy">{r.reply.body}</p>
        </div>
      ) : null}
      {r.reported ? (
        <p className="text-caption text-amber">
          {t('centre.reviews.reportedNote', { reason: r.reported.reason })}
        </p>
      ) : null}
      {mode ? (
        <div className="flex flex-col gap-2">
          <Textarea
            label={t(mode === 'reply' ? 'centre.reviews.replyLabel' : 'centre.reviews.reportLabel')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={600}
            counter={(n, max) => t('common.counter', { n, max })}
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => send.mutate()}
              disabled={send.isPending || !text.trim()}
              data-testid={`send-${mode}-${r.id}`}
            >
              {t(mode === 'reply' ? 'centre.reviews.postReply' : 'centre.reviews.sendReport')}
            </Button>
            <Button variant="quiet" onClick={() => setMode(null)}>
              {t('common.cancel')}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="text-caption text-red">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex gap-4">
          {r.visibility === 'public' ? (
            <button
              type="button"
              className="min-h-11 text-label text-blueText"
              onClick={() => setMode('reply')}
              data-testid={`reply-${r.id}`}
            >
              {t(r.reply ? 'centre.reviews.editReply' : 'centre.reviews.replyPublicly')}
            </button>
          ) : null}
          {!r.reported && r.visibility === 'public' ? (
            <button
              type="button"
              className="min-h-11 text-label text-muted"
              onClick={() => setMode('report')}
              data-testid={`report-${r.id}`}
            >
              {t('centre.reviews.report')}
            </button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
