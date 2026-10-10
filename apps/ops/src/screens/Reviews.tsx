'use client';

import { opsApi, type ReviewQueueItem } from '@link/api-client';
import { createTranslator, formatNumber, type Locale, type MessageKey } from '@link/i18n';
import { Button, Card, Rating, StatusBadge } from '@link/ui';
import {
  ActionError,
  DueBadge,
  Header,
  History,
  ListState,
  ReasonAction,
  type T,
  useAction,
  when,
} from '../parts';
import { useLoad } from '../useLoad';

/** L02 · Review moderation (MKT-OPS-03, BR-REV-04, BR-REV-05): 48-hour target. */
export function ReviewsScreen({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const q = useLoad(() => opsApi.reviewQueue(), []);
  return (
    <>
      <Header title={t('ops.reviews.title')} lead={t('ops.reviews.lead')} />
      <ListState t={t} {...q} empty={t('ops.reviews.empty')}>
        {(rows) => (
          <div className="flex flex-col gap-4">
            {rows.map((r) => (
              <ReviewCard key={r.id} t={t} locale={locale} r={r} reload={q.reload} />
            ))}
          </div>
        )}
      </ListState>
    </>
  );
}

function ReviewCard({
  t,
  locale,
  r,
  reload,
}: {
  t: T;
  locale: Locale;
  r: ReviewQueueItem;
  reload: () => void;
}) {
  const a = useAction(t, reload);
  return (
    <Card padding="lg" className="flex flex-col gap-4" data-testid="review-item">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading">
            {r.targetName}
            {r.targetType === 'teacher' ? ` · ${r.centreName}` : ''}
          </h2>
          <span className="flex items-center gap-2 text-caption text-muted">
            <Rating
              value={formatNumber(r.stars, locale)}
              label={t('ops.reviews.stars', { n: r.stars })}
            />
            {t(`ops.reviews.visibility.${r.visibility}` as MessageKey)} ·{' '}
            {when(r.createdAt, locale)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone="warning">
            {t(`ops.reviews.status.${r.status}` as MessageKey)}
          </StatusBadge>
          <DueBadge t={t} dueAt={r.dueAt} />
        </div>
      </div>
      <blockquote className="rounded-12 bg-soft p-4 text-body">{r.body || '—'}</blockquote>
      {r.flags.length || r.reports.length ? (
        <ul className="flex flex-col gap-1 text-caption">
          {r.flags.map((f) => (
            <li key={f}>
              <StatusBadge tone="error">{t(`ops.reviews.flags.${f}` as MessageKey)}</StatusBadge>
            </li>
          ))}
          {r.reports.map((p, i) => (
            <li key={i} className="text-muted">
              {t('ops.reviews.reported', { when: when(p.createdAt, locale) })}: {p.reason}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        <Button
          disabled={a.busy}
          onClick={() => a.run(() => opsApi.decideReview(r.id, 'publish'))}
          data-testid="review-publish"
        >
          {t('ops.reviews.publish')}
        </Button>
        <Button
          variant="secondary"
          danger
          disabled={a.busy}
          onClick={() => a.run(() => opsApi.decideReview(r.id, 'hide'))}
        >
          {t('ops.reviews.hide')}
        </Button>
        <ReasonAction
          t={t}
          label={t('ops.reviews.requestEdit')}
          field={t('ops.reviews.editNote')}
          busy={a.busy}
          onConfirm={(note) => a.run(() => opsApi.decideReview(r.id, 'request_edit', note))}
        />
      </div>
      <p className="text-caption text-muted">{t('ops.reviews.rule')}</p>
      <ActionError error={a.error} />
      <History t={t} locale={locale} objectType="review" objectRef={r.id} />
    </Card>
  );
}
