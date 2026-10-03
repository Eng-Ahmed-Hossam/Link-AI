'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import {
  api,
  ApiError,
  newIdempotencyKey,
  queryKeys,
  useEnrolment,
  type ReviewTag,
} from '@link/api-client';
import { formatNumber } from '@link/i18n';
import {
  Avatar,
  Button,
  Callout,
  Card,
  EmptyState,
  FilterChip,
  PageTitle,
  RadioCards,
  StarInput,
  Textarea,
} from '@link/ui';
import { useI18n } from '../../i18n-client';
import { QueryState } from '../QueryState';

const CENTRE_TAGS: ReviewTag[] = ['communication', 'organised', 'location', 'good_value'];
const TEACHER_TAGS: ReviewTag[] = ['explains_clearly', 'patient', 'homework_feedback', 'exam_prep'];
const MAX = 600;

type Target = 'centre' | 'teacher';

/**
 * P10 · Leave feedback (MKT-REV-01). Verified parent after the first session only (BR-REV-01).
 * Centre and teacher are rated separately; one review per rated target (BR-REV-02).
 * PLACEHOLDER: Figma has one text box for both; we send the same text with each review (open question).
 */
export function P10Feedback({ id }: { id: string }) {
  const { locale, t } = useI18n();
  const qc = useQueryClient();
  const q = useEnrolment(id);
  const [stars, setStars] = useState<Record<Target, number>>({ centre: 0, teacher: 0 });
  const [tags, setTags] = useState<Record<Target, ReviewTag[]>>({ centre: [], teacher: [] });
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<null | { held: boolean }>(null);
  // One key per target, kept across retries so a double tap never posts twice.
  const keys = useRef<Record<Target, string>>({
    centre: newIdempotencyKey(),
    teacher: newIdempotencyKey(),
  });

  const toggleTag = (target: Target, tag: ReviewTag, on: boolean) =>
    setTags((x) => ({
      ...x,
      [target]: on ? [...x[target], tag] : x[target].filter((y) => y !== tag),
    }));

  return (
    <QueryState query={q} loadingRows={3}>
      {(e) => {
        if (result)
          return (
            <Card
              padding="lg"
              className="flex flex-col items-center gap-3 text-center"
              role="status"
            >
              <h1 className="text-title text-navy">{t('parent.feedback.thanks')}</h1>
              <p className="text-body text-muted">
                {result.held
                  ? t('parent.feedback.held')
                  : t(
                      visibility === 'public'
                        ? 'parent.feedback.published'
                        : 'parent.feedback.sentPrivately',
                    )}
              </p>
              <Link href={`/${locale}/children`} className="text-label text-blueText">
                {t('parent.done.toChildren')}
              </Link>
            </Card>
          );
        if (!e.canReview)
          return (
            <EmptyState
              title={t('parent.feedback.notYetTitle')}
              body={
                e.firstSessionStarted
                  ? t('parent.feedback.doneBody')
                  : t('parent.feedback.notYetBody')
              }
              action={
                <Link href={`/${locale}/children`} className="text-label text-blueText">
                  {t('parent.done.toChildren')}
                </Link>
              }
            />
          );
        const childFirst = e.student.displayName.split(' ')[0] ?? '';
        const weeks = Math.max(
          1,
          Math.floor((Date.now() - new Date(e.firstSession.startsAt).getTime()) / (7 * 86400000)),
        );
        const targets: {
          key: Target;
          title: string;
          tags: ReviewTag[];
          avatar: React.ReactNode;
        }[] = [
          {
            key: 'centre',
            title: t('parent.feedback.theCentre', { name: e.group.centre.name }),
            tags: CENTRE_TAGS,
            avatar: <Avatar name={e.group.centre.name} tone="navy" size="sm" square />,
          },
          {
            key: 'teacher',
            title: e.group.teacher.displayName,
            tags: TEACHER_TAGS,
            avatar: <Avatar name={e.group.teacher.displayName} size="sm" />,
          },
        ];

        async function submit() {
          const rated = targets.filter((x) => stars[x.key] > 0);
          if (!rated.length) {
            setError(t('parent.feedback.needStars'));
            return;
          }
          setBusy(true);
          setError(null);
          try {
            let held = false;
            for (const x of rated) {
              const r = await api.createReview(
                {
                  enrolmentId: e.id,
                  targetType: x.key,
                  stars: stars[x.key],
                  tags: tags[x.key],
                  body: body.trim(),
                  visibility,
                },
                keys.current[x.key],
              );
              held ||= r.status === 'held';
            }
            await qc.invalidateQueries({ queryKey: queryKeys.myEnrolments });
            setResult({ held });
          } catch (err) {
            setError(
              err instanceof ApiError && err.code === 'already_reviewed'
                ? t('parent.feedback.already')
                : err instanceof ApiError && err.isNetwork
                  ? t('states.offline.body')
                  : t('states.error.body'),
            );
          } finally {
            setBusy(false);
          }
        }

        return (
          <>
            <PageTitle
              context={t('parent.feedback.verified', { name: childFirst })}
              title={t('parent.feedback.title')}
              subtitle={t('parent.feedback.subtitle', {
                subject: e.group.subject.name,
                teacher: e.group.teacher.displayName,
                centre: e.group.centre.name,
                weeks: formatNumber(weeks, locale),
                count: weeks,
              })}
            />
            {targets.map((x) => (
              <Card key={x.key} className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  {x.avatar}
                  <h2 className="min-w-0 flex-1 text-label text-navy">
                    <bdi>{x.title}</bdi>
                  </h2>
                </div>
                <StarInput
                  label={t('parent.feedback.rate', { name: x.title })}
                  value={stars[x.key]}
                  onValueChange={(v) => setStars((s) => ({ ...s, [x.key]: v }))}
                  starLabel={(n) => t('parent.review.stars', { count: n })}
                />
                <div
                  role="group"
                  aria-label={t('parent.feedback.tagsLabel')}
                  className="flex flex-wrap gap-2"
                >
                  {x.tags.map((tag) => (
                    <FilterChip
                      key={tag}
                      pressed={tags[x.key].includes(tag)}
                      onPressedChange={(on) => toggleTag(x.key, tag, on)}
                    >
                      {t(`parent.tag.${tag}`)}
                    </FilterChip>
                  ))}
                </div>
              </Card>
            ))}

            <Textarea
              label={t('parent.feedback.textLabel')}
              value={body}
              maxLength={MAX}
              onChange={(ev) => setBody(ev.target.value)}
              placeholder={t('parent.feedback.textPlaceholder')}
              counter={(n, max) =>
                t('common.counter', { n: formatNumber(n, locale), max: formatNumber(max, locale) })
              }
            />

            <h2 className="text-label text-navy">{t('parent.feedback.whoSees')}</h2>
            <RadioCards
              label={t('parent.feedback.whoSees')}
              value={visibility}
              onValueChange={(v) => setVisibility(v as 'public' | 'private')}
              options={[
                {
                  value: 'public',
                  title: t('parent.feedback.public'),
                  description: t('parent.feedback.publicDesc', { year: e.student.schoolYear.name }),
                },
                {
                  value: 'private',
                  title: t('parent.feedback.private'),
                  description: t('parent.feedback.privateDesc', {
                    teacher: e.group.teacher.displayName,
                    centre: e.group.centre.name,
                  }),
                },
              ]}
            />
            <Callout tone="neutral">{t('parent.feedback.checks')}</Callout>
            {error ? (
              <p role="alert" className="text-caption text-red">
                {error}
              </p>
            ) : null}
            <Button block disabled={busy} onClick={submit}>
              {busy ? t('common.loading') : t('parent.feedback.submit')}
            </Button>
          </>
        );
      }}
    </QueryState>
  );
}
