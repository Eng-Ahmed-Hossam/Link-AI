/**
 * "Request a free pilot" (landing page, path B): the request is validated here, in the browser and
 * again in `app/api/pilot-request`, then emailed to the Link team (ADR-0009). Nothing is stored and
 * nothing is logged in clear: the only copy is the email.
 */

export interface PilotRequest {
  centreName: string;
  contactName: string;
  /** Egyptian mobile, normalised to 11 digits starting with 01. */
  phone: string;
  area: string;
  teachers: number;
  lang: 'ar' | 'en';
}

export type PilotField = 'centre' | 'contact' | 'phone' | 'area' | 'teachers' | 'consent';

/** A hidden field people never see; bots fill it. A filled one is answered "ok" and dropped. */
export const HONEYPOT = 'website';

/** Arabic-Indic and Persian digits → ASCII (RTL-04: people type either). */
export const toAsciiDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));

/** An Egyptian mobile number (010, 011, 012, 015) in any common spelling, or null. */
export function normalisePhone(raw: string): string | null {
  let d = toAsciiDigits(raw).replace(/[\s\-().]/g, '');
  if (d.startsWith('+20')) d = `0${d.slice(3)}`;
  else if (d.startsWith('0020')) d = `0${d.slice(4)}`;
  else if (/^1[0125]\d{8}$/.test(d)) d = `0${d}`;
  return /^01[0125]\d{8}$/.test(d) ? d : null;
}

const text = (v: unknown, max: number) => {
  if (typeof v !== 'string') return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length >= 2 && s.length <= max ? s : null;
};

export function validatePilotRequest(
  input: unknown,
): { ok: true; value: PilotRequest } | { ok: false; errors: PilotField[] } {
  const b = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const errors: PilotField[] = [];
  const centreName = text(b.centreName, 80);
  if (!centreName) errors.push('centre');
  const contactName = text(b.contactName, 80);
  if (!contactName) errors.push('contact');
  const phone = typeof b.phone === 'string' ? normalisePhone(b.phone) : null;
  if (!phone) errors.push('phone');
  const area = text(b.area, 80);
  if (!area) errors.push('area');
  const n = Number(toAsciiDigits(String(b.teachers ?? '')).trim());
  const teachers = Number.isInteger(n) && n >= 1 && n <= 500 ? n : null;
  if (teachers === null) errors.push('teachers');
  if (b.consent !== true) errors.push('consent');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      centreName: centreName!,
      contactName: contactName!,
      phone: phone!,
      area: area!,
      teachers: teachers!,
      lang: b.lang === 'en' ? 'en' : 'ar',
    },
  };
}

export const isSpam = (input: unknown) => {
  const v = input && typeof input === 'object' ? (input as Record<string, unknown>)[HONEYPOT] : '';
  return typeof v === 'string' && v.trim() !== '';
};

/** Fixed-window limit per key (in memory: per server instance, enough for a landing form). */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit = 5,
    private readonly windowMs = 10 * 60_000,
  ) {}
  /** Records a hit; false when the key is over the limit. */
  hit(key: string, now = Date.now()): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.hits.clear(); // never grow without bound
    return true;
  }
}

const mask = (s: string) => `${[...s][0] ?? ''}… (${[...s].length})`;

/** What may be printed to a log: shapes and counts, never a name or a whole number. */
export const redact = (r: PilotRequest) => ({
  centreName: mask(r.centreName),
  contactName: mask(r.contactName),
  phone: `${r.phone.slice(0, 3)}******${r.phone.slice(-2)}`,
  area: mask(r.area),
  teachers: r.teachers,
  lang: r.lang,
});

/** The email to the Link team (plain text; both languages' labels so anyone can read it). */
export function pilotEmail(r: PilotRequest, at = new Date()) {
  const when = at.toLocaleString('en-GB', { timeZone: 'Africa/Cairo' });
  return {
    subject: `Pilot request: ${r.centreName} (${r.area})`,
    text: [
      'New free-pilot request from the landing page.',
      '',
      `Centre / المركز: ${r.centreName}`,
      `Contact / الاسم: ${r.contactName}`,
      `Phone or WhatsApp / الهاتف: ${r.phone}`,
      `Area / المنطقة: ${r.area}`,
      `Teachers / عدد المعلّمين: ${r.teachers}`,
      `Page language: ${r.lang}`,
      `Received: ${when} (Cairo)`,
      '',
      'They agreed to be contacted about a pilot, and for nothing else. This email is the only copy.',
    ].join('\n'),
  };
}
