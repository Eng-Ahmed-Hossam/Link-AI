// A11: `pnpm i18n:apply-review` writes reviewed Arabic back, and refuses broken ICU or placeholders.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'review-strings.mjs');
const MSG = join(HERE, '..', 'messages');

function sandbox() {
  const dir = mkdtempSync(join(tmpdir(), 'i18n-review-'));
  for (const f of ['en.json', 'ar.json', 'proposed.ar.json'])
    copyFileSync(join(MSG, f), join(dir, f));
  return dir;
}
function apply(dir, csv) {
  const file = join(dir, 'reviewed.csv');
  writeFileSync(file, csv);
  try {
    return {
      ok: true,
      out: execFileSync(process.execPath, [SCRIPT, 'apply', file], {
        env: { ...process.env, I18N_MESSAGES_DIR: dir },
        encoding: 'utf8',
      }),
    };
  } catch (e) {
    return { ok: false, out: String(e.stderr ?? e) };
  }
}
const json = (dir, f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const HEAD = 'key,english,current_arabic,screen,reviewed_arabic\n';

describe('i18n:apply-review (pilot A11)', () => {
  it('writes the reviewed Arabic and takes the key off the proposed list; empty rows change nothing', () => {
    const dir = sandbox();
    const r = apply(
      dir,
      HEAD +
        'owner.pilot.copy,Copy message,انسخ الرسالة,A09,"انسخ نص الرسالة"\n' +
        'owner.pilot.badge,Pilot,تجربة,Shell,\n',
    );
    expect(r.ok).toBe(true);
    expect(json(dir, 'ar.json')['owner.pilot.copy']).toBe('انسخ نص الرسالة');
    expect(json(dir, 'ar.json')['owner.pilot.badge']).toBe('تجربة');
    expect(json(dir, 'proposed.ar.json')).not.toContain('owner.pilot.copy');
    expect(json(dir, 'proposed.ar.json')).toContain('owner.pilot.badge');
  });

  it('refuses a missing placeholder, a broken plural or Western digits — and writes nothing', () => {
    const dir = sandbox();
    const before = readFileSync(join(dir, 'ar.json'), 'utf8');
    const r = apply(
      dir,
      HEAD +
        'owner.pilot.sentBy,x,x,x,"معتمدة — أرسلها يدويًا"\n' +
        'owner.pilot.rateLimited,x,x,x,"انتظر 15 دقيقة"\n' +
        'owner.pilot.wrongPin,x,x,x,"{count, plural, one {خطأ {n}} other {خطأ {n}}}"\n',
    );
    expect(r.ok).toBe(false);
    expect(r.out).toContain('owner.pilot.sentBy: placeholders');
    expect(r.out).toContain('owner.pilot.rateLimited: use Arabic-Indic digits');
    expect(r.out).toContain('owner.pilot.wrongPin: Arabic plural needs few and many');
    expect(readFileSync(join(dir, 'ar.json'), 'utf8')).toBe(before);
  });
});
