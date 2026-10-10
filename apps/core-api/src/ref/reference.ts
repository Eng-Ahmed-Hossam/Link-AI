import { Controller, Inject } from '@nestjs/common';
import { routes } from '../contract/routes';
import { Database, type Tx } from '../platform/db';
import { CallerLang, Endpoint, type In, Input } from '../platform/http';
import { notFound } from '../platform/problem';

type Lang = 'ar' | 'en';
type Code = 'NATIONAL' | 'IGCSE' | 'AMERICAN' | 'NILE';
const pick = (r: { name_en: string; name_ar: string }, lang: Lang) =>
  lang === 'ar' ? r.name_ar : r.name_en;

/** Reference data (docs/06 §2): public reads, no tenant. Names in the caller's language. */
export class Reference {
  constructor(private readonly db: Database) {}

  async curriculumRef(tx: Tx, id: string, lang: Lang) {
    const c = await tx
      .selectFrom('ref.curricula')
      .select(['id', 'code', 'name_en', 'name_ar'])
      .where('id', '=', id)
      .executeTakeFirst();
    if (!c) throw notFound('curriculum');
    return { id: c.id, code: c.code as Code, name: pick(c, lang) };
  }

  async schoolYearRef(tx: Tx, id: string, lang: Lang) {
    const y = await tx
      .selectFrom('ref.school_years')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!y) throw notFound('school year');
    return yearView(y, lang);
  }

  curricula(lang: Lang) {
    return this.db.asAnonymous(async (tx) => {
      const cs = await tx
        .selectFrom('ref.curricula')
        .select(['id', 'code', 'name_en', 'name_ar'])
        .where('active', '=', true)
        .orderBy('position')
        .execute();
      const ys = await tx.selectFrom('ref.school_years').selectAll().orderBy('position').execute();
      return cs.map((c) => ({
        id: c.id,
        code: c.code as Code,
        name: pick(c, lang),
        schoolYears: ys.filter((y) => y.curriculum_id === c.id).map((y) => yearView(y, lang)),
      }));
    });
  }

  /** Areas where a verified centre is (the names as stored; PATCH /v1/me accepts exactly these). */
  areas() {
    return this.db.asAnonymous(async (tx) =>
      (
        await tx
          .selectFrom('market.public_centres')
          .select(['area', 'governorate'])
          .where('area', 'is not', null)
          .distinct()
          .orderBy('governorate')
          .orderBy('area')
          .execute()
      ).map((r) => ({ name: r.area!, governorate: r.governorate })),
    );
  }

  /**
   * Subjects. With a curriculum and year, that year's rows. Without, one row per subject code (the
   * first by curriculum and year order) — the list the apps show before a year is picked.
   */
  subjects(lang: Lang, q: { curriculumId?: string; schoolYearId?: string }) {
    return this.db.asAnonymous(async (tx) => {
      let query = tx
        .selectFrom('ref.subjects as s')
        .innerJoin('ref.curricula as c', 'c.id', 's.curriculum_id')
        .innerJoin('ref.school_years as y', 'y.id', 's.school_year_id')
        .select(['s.id', 's.code', 's.name_en', 's.name_ar'])
        .where('s.active', '=', true)
        .orderBy('c.position')
        .orderBy('y.position')
        .orderBy('s.code');
      if (q.curriculumId) query = query.where('s.curriculum_id', '=', q.curriculumId);
      if (q.schoolYearId) query = query.where('s.school_year_id', '=', q.schoolYearId);
      const rows = await query.execute();
      const seen = new Set<string>();
      const one = q.curriculumId && q.schoolYearId;
      return rows
        .filter((r) => one || (!seen.has(r.code) && seen.add(r.code)))
        .map((r) => ({ id: r.id, code: r.code, name: pick(r, lang) }));
    });
  }
}

const yearView = (
  y: {
    id: string;
    code: string;
    name_en: string;
    name_ar: string;
    short_name_en: string | null;
    short_name_ar: string | null;
  },
  lang: Lang,
) => ({
  id: y.id,
  code: y.code,
  name: pick(y, lang),
  shortName: (lang === 'ar' ? y.short_name_ar : y.short_name_en) ?? pick(y, lang),
});

@Controller()
export class ReferenceController {
  constructor(@Inject(Reference) private readonly ref: Reference) {}

  @Endpoint(routes.curricula)
  curricula(@CallerLang() lang: Lang) {
    return this.ref.curricula(lang);
  }

  @Endpoint(routes.areas)
  areas() {
    return this.ref.areas();
  }

  @Endpoint(routes.subjects)
  subjects(@CallerLang() lang: Lang, @Input() i: In<typeof routes.subjects>) {
    return this.ref.subjects(lang, i.query);
  }
}
