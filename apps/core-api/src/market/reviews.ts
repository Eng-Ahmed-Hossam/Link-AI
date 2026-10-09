import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { sql } from 'kysely';
import { routes } from '../contract/routes';
import { writeAudit } from '../platform/audit';
import { type Database, type RlsContext, type Tx, can } from '../platform/db';
import { Caller, Endpoint, type In, Input, type Principal } from '../platform/http';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, forbidden, notFound } from '../platform/problem';
import { requestIdOf } from '../platform/request-context';
import { cairoToday } from '../platform/time';
import { type Lang, ratingOf } from './model';

/** BR-REV-04 automatic checks: phone numbers, e-mail and WhatsApp links hold a review for ops. */
const CONTACT_PATTERN =
  /(\+?2?0?1[0125][\s-]?\d{3,4}[\s-]?\d{4})|([٠-٩]{8,})|(\d{8,})|(@\w)|(wa\.me)/;

type Tab = 'public' | 'private' | 'reported';

/** Published public reviews of a centre or teacher (P04, P05), newest first. */
export async function publicReviews(
  tx: Tx,
  type: 'centre' | 'teacher',
  targetId: string,
  lang: Lang,
) {
  const rows = await tx
    .selectFrom('market.reviews as r')
    .innerJoin('ref.school_years as y', 'y.id', 'r.school_year_id')
    .leftJoin('market.review_replies as rr', (j) =>
      j.onRef('rr.review_id', '=', 'r.id').on('rr.status', '=', 'published'),
    )
    .select([
      'r.id',
      'r.stars',
      'r.tags',
      'r.body',
      'r.published_at',
      'r.centre_id',
      'y.short_name_en',
      'y.short_name_ar',
      'y.name_en',
      'y.name_ar',
      'rr.body as reply',
    ])
    .where('r.target_type', '=', type)
    .where('r.target_id', '=', targetId)
    .where('r.visibility', '=', 'public')
    .where('r.status', '=', 'published')
    .orderBy('r.published_at', 'desc')
    .limit(20)
    .execute();
  const names = new Map<string, string>();
  for (const r of rows.filter((x) => x.reply))
    if (!names.has(r.centre_id)) {
      const c = await tx
        .selectFrom('market.public_centres')
        .select('name')
        .where('id', '=', r.centre_id)
        .executeTakeFirst();
      names.set(r.centre_id, c?.name ?? '');
    }
  return rows.map((r) => ({
    id: r.id,
    stars: r.stars,
    tags: r.tags as never[],
    body: r.body,
    schoolYearName:
      (lang === 'ar' ? (r.short_name_ar ?? r.name_ar) : (r.short_name_en ?? r.name_en)) ?? '',
    publishedAt: new Date(r.published_at ?? new Date()).toISOString(),
    reply: r.reply ? { body: r.reply, authorName: names.get(r.centre_id) ?? '' } : null,
  }));
}

/**
 * Reviews (MKT-REV, BR-REV): only the verified parent of a confirmed enrolment, after the first
 * session, once per enrolment, target and term. The target replies or reports; nobody but ops
 * changes a review (BR-REV-06), and there is no delete anywhere.
 */
export class Reviews {
  constructor(private readonly db: Database) {}

  create(
    userId: string,
    b: {
      enrolmentId: string;
      targetType: 'centre' | 'teacher';
      stars: number;
      tags: string[];
      body: string;
      visibility: 'public' | 'private';
    },
    requestId?: string,
  ) {
    return this.db.asUser(userId, async (tx, ctx) => {
      if (!ctx.guardianId) throw forbidden('Only parents review.');
      const e = await tx
        .selectFrom('market.enrolments as e')
        .innerJoin('market.group_sessions as s', 's.id', 'e.first_session_id')
        .innerJoin('market.groups as g', 'g.id', 'e.group_id')
        .select([
          'e.id',
          'e.status',
          'e.centre_id',
          'e.teacher_id',
          'e.guardian_id',
          's.starts_at',
          'g.school_year_id',
        ])
        .where('e.id', '=', b.enrolmentId)
        .executeTakeFirst();
      if (!e || e.guardian_id !== ctx.guardianId) throw notFound('enrolment');
      // BR-REV-01: verified parent = guardian of a confirmed enrolment, after the first session.
      if (
        !['confirmed', 'past_due', 'ended'].includes(e.status) ||
        new Date(e.starts_at) > new Date()
      )
        throw new Problem(403, 'not_verified_parent', 'Reviews open after the first session.');
      if (!Number.isInteger(b.stars) || b.stars < 1 || b.stars > 5)
        throw new Problem(422, 'validation_failed', 'Choose 1 to 5 stars.');
      const text = b.body.trim();
      if (text.length > 600)
        throw new Problem(422, 'body_too_long', 'Use 600 characters or fewer.');
      const term = await tx
        .selectFrom('ref.academic_terms')
        .select('id')
        .where('starts_on', '<=', sql<Date>`${cairoToday()}::date`)
        .where('ends_on', '>=', sql<Date>`${cairoToday()}::date`)
        .executeTakeFirst();
      // BR-REV-04: automatic checks; a failed one holds the review for the ops queue (L02).
      const flags = CONTACT_PATTERN.test(text) ? ['contact_details'] : [];
      const status = flags.length ? 'held' : 'published';
      const id = uuidv7();
      await tx
        .insertInto('market.reviews')
        .values({
          id,
          enrolment_id: e.id,
          guardian_id: ctx.guardianId,
          target_type: b.targetType,
          target_id: b.targetType === 'centre' ? e.centre_id : e.teacher_id,
          centre_id: e.centre_id,
          term_id: term?.id ?? null,
          school_year_id: e.school_year_id,
          stars: b.stars,
          tags: b.tags,
          body: text,
          visibility: b.visibility,
          status,
          flags,
          published_at: status === 'published' ? new Date() : null,
        })
        .execute();
      await enqueue(tx, {
        type: 'review.submitted',
        aggregateType: 'review',
        aggregateId: id,
        centreId: e.centre_id,
        data: { reviewId: id, targetType: b.targetType, status },
        requestId,
      });
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: e.centre_id,
        action: 'review.submitted',
        objectType: 'review',
        objectRef: id,
        after: { status, visibility: b.visibility, stars: b.stars, flags },
        requestId,
      });
      return { id, status: status as 'published' | 'held' };
    });
  }

  /** C04 (owner, staff with a centre) or the teacher's own reviews (MKT-REV-03). */
  received(
    userId: string,
    q: { centreId?: string; visibility?: 'public' | 'private'; status?: 'reported' },
    lang: Lang,
  ) {
    const tab: Tab =
      q.status === 'reported' ? 'reported' : q.visibility === 'private' ? 'private' : 'public';
    return this.db.asUser(userId, async (tx, ctx) => {
      let base = tx
        .selectFrom('market.reviews as r')
        .innerJoin('ref.school_years as y', 'y.id', 'r.school_year_id')
        .leftJoin('market.review_replies as rr', 'rr.review_id', 'r.id')
        .select([
          'r.id',
          'r.target_type',
          'r.target_id',
          'r.stars',
          'r.body',
          'r.visibility',
          'r.created_at',
          'r.status',
          'y.short_name_en',
          'y.short_name_ar',
          'rr.body as reply_body',
          'rr.created_at as reply_at',
          sql<{ reason: string; at: Date } | null>`(
            SELECT json_build_object('reason', rp.reason, 'at', rp.created_at) FROM market.review_reports rp
            WHERE rp.review_id = r.id ORDER BY rp.created_at DESC LIMIT 1)`.as('report'),
        ])
        .where('r.status', 'in', ['published', 'held']);
      let teacherIds: string[];
      if (q.centreId) {
        if (!ctx.centreIds.includes(q.centreId)) throw notFound('centre');
        base = base.where('r.centre_id', '=', q.centreId);
        teacherIds = (
          await tx
            .selectFrom('market.groups')
            .select('teacher_id')
            .distinct()
            .where('centre_id', '=', q.centreId)
            .execute()
        ).map((g) => g.teacher_id);
      } else {
        if (!ctx.teacherId)
          throw new Problem(422, 'validation_failed', 'Pass centreId (owners and staff).');
        base = base.where('r.target_type', '=', 'teacher').where('r.target_id', '=', ctx.teacherId);
        teacherIds = [ctx.teacherId];
      }
      const rows = await base.orderBy('r.created_at', 'desc').execute();
      const teachers = teacherIds.length
        ? await this.db.asSystem((sys) =>
            sys
              .selectFrom('org.teachers as t')
              .leftJoin('market.review_stats as rs', (j) =>
                j.onRef('rs.target_id', '=', 't.id').on('rs.target_type', '=', 'teacher'),
              )
              .select(['t.id', 't.display_name', 'rs.distribution'])
              .where('t.id', 'in', teacherIds)
              .execute(),
          )
        : [];
      const centre = q.centreId
        ? await tx
            .selectFrom('org.centres as c')
            .leftJoin('market.review_stats as rs', (j) =>
              j.onRef('rs.target_id', '=', 'c.id').on('rs.target_type', '=', 'centre'),
            )
            .select(['c.name', 'rs.distribution', 'rs.tag_counts'])
            .where('c.id', '=', q.centreId)
            .executeTakeFirst()
        : undefined;
      const nameOf = (type: string, id: string) =>
        type === 'centre'
          ? (centre?.name ?? '')
          : (teachers.find((t) => t.id === id)?.display_name ?? '');
      const all = rows.map((r) => ({
        id: r.id,
        target: {
          kind: r.target_type as 'centre' | 'teacher',
          name: nameOf(r.target_type, r.target_id),
        },
        stars: r.stars,
        body: r.body,
        schoolYear: (lang === 'ar' ? r.short_name_ar : r.short_name_en) ?? '',
        createdAt: new Date(r.created_at).toISOString(),
        visibility: r.visibility as 'public' | 'private',
        reply: r.reply_body
          ? { body: r.reply_body, at: new Date(r.reply_at!).toISOString() }
          : null,
        reported: r.report
          ? { reason: r.report.reason, at: new Date(r.report.at).toISOString() }
          : null,
      }));
      const inTab = (x: (typeof all)[number]) =>
        tab === 'reported'
          ? !!x.reported
          : tab === 'private'
            ? x.visibility === 'private'
            : x.visibility === 'public' && !x.reported;
      const cr = ratingOf(centre?.distribution);
      const monthStart = `${cairoToday().slice(0, 7)}-01`;
      return {
        summary: {
          centre: { rating: cr.avg ?? 0, count: cr.count },
          teachers: teachers.map((t) => {
            const r = ratingOf(t.distribution);
            return { name: t.display_name, rating: r.avg ?? 0, count: r.count };
          }),
          privateThisMonth: all.filter(
            (x) => x.visibility === 'private' && x.createdAt.slice(0, 10) >= monthStart,
          ).length,
        },
        counts: {
          public: all.filter((x) => x.visibility === 'public' && !x.reported).length,
          private: all.filter((x) => x.visibility === 'private').length,
          reported: all.filter((x) => !!x.reported).length,
        },
        mentions: ((centre?.tag_counts ?? []) as { tag: string; count: number }[])
          .slice()
          .sort((a, b) => b.count - a.count),
        items: all.filter(inTab),
      };
    });
  }

  /** The review's centre (staff with `reviews.reply`, the owner) or the teacher it is about. */
  private async targetOf(tx: Tx, ctx: RlsContext, id: string) {
    const r = await tx
      .selectFrom('market.reviews')
      .select(['id', 'centre_id', 'target_type', 'target_id', 'visibility'])
      .where('id', '=', id)
      .executeTakeFirst();
    // Someone outside the review's centre (and not the teacher reviewed): another tenant's row (07 §1).
    const isTarget = r?.target_type === 'teacher' && r.target_id === ctx.teacherId;
    if (!r || !(ctx.centreIds.includes(r.centre_id) || isTarget)) throw notFound('review');
    if (!can(ctx, r.centre_id, 'reviews.reply') && !isTarget)
      throw forbidden(
        'Only the owner, staff who answer reviews, or the teacher reviewed can do this.',
      );
    return r;
  }

  reply(userId: string, id: string, body: string, requestId?: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const r = await this.targetOf(tx, ctx, id);
      const text = body?.trim() ?? '';
      if (!text) throw new Problem(422, 'reply_required', 'Write your reply.');
      if (text.length > 600) throw new Problem(422, 'too_long', 'Up to 600 characters.');
      if (r.visibility === 'private')
        throw new Problem(409, 'private_feedback', 'Private feedback gets no public reply.');
      const replyId = uuidv7();
      await tx
        .insertInto('market.review_replies')
        .values({
          id: replyId,
          review_id: r.id,
          centre_id: r.centre_id,
          author_user_id: userId,
          body: text,
        })
        .execute();
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: r.centre_id,
        action: 'review.replied',
        objectType: 'review',
        objectRef: r.id,
        requestId,
      });
      return { ok: true as const };
    });
  }

  report(userId: string, id: string, reason: string, requestId?: string) {
    return this.db.asUser(userId, async (tx, ctx) => {
      const r = await this.targetOf(tx, ctx, id);
      const text = reason?.trim() ?? '';
      if (!text) throw new Problem(422, 'reason_required', 'Say why you are reporting it.');
      await tx
        .insertInto('market.review_reports')
        .values({
          id: uuidv7(),
          review_id: r.id,
          centre_id: r.centre_id,
          reported_by: userId,
          reason: text.slice(0, 600),
        })
        .execute();
      // BR-REV-04: a reported review goes to the ops queue (L02); it is never hidden by the target.
      await enqueue(tx, {
        type: 'review.reported',
        aggregateType: 'review',
        aggregateId: r.id,
        centreId: r.centre_id,
        data: { reviewId: r.id },
        requestId,
      });
      await writeAudit(tx, {
        actorId: userId,
        actorType: 'user',
        centreId: r.centre_id,
        action: 'review.reported',
        objectType: 'review',
        objectRef: r.id,
        requestId,
      });
      return { ok: true as const };
    });
  }
}

@Controller()
export class ReviewsController {
  constructor(@Inject(Reviews) private readonly reviews: Reviews) {}

  @Endpoint(routes.createReview)
  create(@Caller() p: Principal, @Input() i: In<typeof routes.createReview>, @Req() req: Request) {
    return this.reviews.create(p.userId, i.body, requestIdOf(req));
  }

  @Endpoint(routes.reviewsReceived)
  received(@Caller() p: Principal, @Input() i: In<typeof routes.reviewsReceived>) {
    return this.reviews.received(p.userId, i.query, p.lang);
  }

  @Endpoint(routes.replyReview)
  reply(@Caller() p: Principal, @Input() i: In<typeof routes.replyReview>, @Req() req: Request) {
    return this.reviews.reply(p.userId, i.params.id, i.body.body, requestIdOf(req));
  }

  @Endpoint(routes.reportReview)
  report(@Caller() p: Principal, @Input() i: In<typeof routes.reportReview>, @Req() req: Request) {
    return this.reviews.report(p.userId, i.params.id, i.body.reason, requestIdOf(req));
  }
}
