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

/** The role chooser (`/{lang}/try`). */
export const ROLE_KEYS = [
  'site.try.parent',
  'site.try.parentBody',
  'site.try.openParent',
  'site.try.teacher',
  'site.try.teacherBody',
  'site.try.openTeacher',
  'site.try.owner',
  'site.try.ownerBody',
  'site.try.openOwner',
  'site.try.opening',
  'site.try.failed',
  'site.try.sample',
] as const satisfies readonly MessageKey[];

export type Strings<K extends readonly MessageKey[]> = Record<K[number], string>;

export const pick = <K extends readonly MessageKey[]>(t: Translate, keys: K): Strings<K> =>
  Object.fromEntries(keys.map((k) => [k, t(k)])) as Strings<K>;
