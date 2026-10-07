import type { MessageKey, Translate } from '@link/i18n';

/**
 * The website's two forms get their words from the server page as a small object, so the
 * translation catalogs (both languages, ~200 KB) never ship to the public pages.
 */
export const PILOT_FORM_KEYS = [
  'landing.form.title',
  'landing.form.centre',
  'landing.form.contact',
  'landing.form.phone',
  'landing.form.phoneHint',
  'landing.form.area',
  'landing.form.areaHint',
  'landing.form.teachers',
  'landing.form.consent',
  'landing.form.honeypot',
  'landing.form.submit',
  'landing.form.sending',
  'landing.form.errCentre',
  'landing.form.errContact',
  'landing.form.errPhone',
  'landing.form.errArea',
  'landing.form.errTeachers',
  'landing.form.errConsent',
  'landing.form.errRate',
  'landing.form.errSend',
  'landing.form.doneTitle',
  'landing.form.doneBody',
  'landing.form.privacy',
  'landing.cta.try',
] as const satisfies readonly MessageKey[];

/** Section 11's "Get started" form on the landing page (Figma 77:698). */
export const JOIN_FORM_KEYS = [
  'site.join.getStarted',
  'site.join.formSub',
  'site.join.name',
  'site.join.namePh',
  'site.join.centre',
  'site.join.centrePh',
  'site.join.area',
  'site.join.areaPh',
  'site.join.teachers',
  'site.join.teachersPh',
  'site.join.phone',
  'site.join.submit',
  'landing.form.consent',
  'landing.form.honeypot',
  'landing.form.sending',
  'landing.form.errCentre',
  'landing.form.errContact',
  'landing.form.errPhone',
  'landing.form.errArea',
  'landing.form.errTeachers',
  'landing.form.errConsent',
  'landing.form.errRate',
  'landing.form.errSend',
  'landing.form.doneTitle',
  'landing.form.doneBody',
] as const satisfies readonly MessageKey[];

export const TRY_FORM_KEYS = [
  'landing.try.centre',
  'landing.try.centreHint',
  'landing.try.errCentre',
  'landing.try.role',
  'landing.try.owner',
  'landing.try.ownerDesc',
  'landing.try.reception',
  'landing.try.receptionDesc',
  'landing.try.teacher',
  'landing.try.teacherDesc',
  'landing.try.errRole',
  'landing.try.teachers',
  'landing.try.submit',
  'landing.try.opening',
  'landing.try.note',
  'landing.try.unavailable',
] as const satisfies readonly MessageKey[];

export type Strings<K extends readonly MessageKey[]> = Record<K[number], string>;

export const pick = <K extends readonly MessageKey[]>(t: Translate, keys: K): Strings<K> =>
  Object.fromEntries(keys.map((k) => [k, t(k)])) as Strings<K>;
