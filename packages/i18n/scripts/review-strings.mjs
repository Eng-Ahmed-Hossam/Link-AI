// Arabic review round-trip (pilot A11).
//
//   node review-strings.mjs export [out.csv]   — every string on the pilot screens and in the three
//                                                staff quick guides, most-seen first: key, English,
//                                                current Arabic, screen, how often staff see it, and
//                                                an empty "reviewed_arabic" column (default:
//                                                docs/pilot/strings-to-review.csv). Also writes the
//                                                one-sitting review pack docs/pilot/arabic-review.md
//                                                (these strings + the guides + the gold scripts).
//   node review-strings.mjs apply <file.csv>    — writes each non-empty reviewed_arabic into ar.json,
//                                                takes the key off the "proposed" list, and refuses
//                                                any change that breaks ICU syntax or placeholders.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..', '..');
const MSG = process.env.I18N_MESSAGES_DIR ?? join(HERE, '..', 'messages'); // override: tests
const read = (f) => JSON.parse(readFileSync(join(MSG, f), 'utf8'));
const write = (f, v) => writeFileSync(join(MSG, f), JSON.stringify(v, null, 2) + '\n');

/**
 * Source files of the PILOT screens → the screen, and how often staff see it (4.5: estimated views
 * per working day across the centre — the daily loop high, settings low). Demo-only screens (Ask
 * Link, the parent reply, P09, phone sign-in) are not reviewed for the pilot.
 */
const SCREENS = [
  ['apps/web/src/owner/screens/CentreSignIn.tsx', 'Centre sign-in (pilot PIN)', 4],
  ['apps/web/src/owner/screens/Today.tsx', 'A01 Today', 10],
  ['apps/web/src/owner/screens/FollowUps.tsx', 'A02 Follow-ups', 6],
  ['apps/web/src/owner/screens/Case.tsx', 'A03 Follow-up case', 8],
  ['apps/web/src/owner/screens/Message.tsx', 'A06/A09 Parent message', 6],
  ['apps/web/src/owner/screens/Outcome.tsx', 'A08/A10 Outcome', 5],
  ['apps/web/src/owner/screens/Communication.tsx', 'A11 Parent communication', 2],
  ['apps/web/src/owner/screens/Students.tsx', 'A13 Students', 2],
  ['apps/web/src/owner/screens/Student.tsx', 'A04 Student', 2],
  ['apps/web/src/owner/screens/Sessions.tsx', 'A05/A14 Sessions', 2],
  ['apps/web/src/owner/screens/Rules.tsx', 'A07 Rules', 0.3],
  ['apps/web/src/owner/screens/PilotPeople.tsx', 'A16 People (pilot)', 0.5],
  ['apps/web/src/owner/screens/Activity.tsx', 'A17 Activity', 1],
  ['apps/web/src/owner/common.tsx', 'Owner web (shared)', 10],
  ['apps/web/src/CentreShell.tsx', 'Owner web (navigation)', 10],
  ['apps/teacher-app/src/screens/PilotSignIn.tsx', 'Teacher sign-in (pilot PIN)', 3],
  ['apps/teacher-app/app/(tabs)', 'T01/T09 Teacher tabs', 8],
  ['apps/teacher-app/app/record', 'T02–T08 Session record', 12],
  ['apps/teacher-app/app/group', 'T10/T13 Group', 2],
  ['apps/teacher-app/app/student', 'T11/T12 Student', 1],
  ['apps/teacher-app/src/screens', 'T13 Records history', 1],
  ['apps/teacher-app/src/ui', 'Teacher app (shared)', 12],
  ['apps/teacher-app/src/format.ts', 'Teacher app (shared)', 12],
  ['packages/ui/src', 'Shared components', 10],
];
/** The staff quick guides (4.3): their quoted screen words («…») are reviewed with the strings. */
const GUIDES = [
  ['docs/pilot/quick-guide-teacher.md', 'Quick guide: teacher'],
  ['docs/pilot/quick-guide-reception.md', 'Quick guide: Reception'],
  ['docs/pilot/quick-guide-owner.md', 'Quick guide: owner'],
];
const files = (p) => {
  const full = join(ROOT, p);
  if (!statSync(full, { throwIfNoEntry: false })) return [];
  if (statSync(full).isFile()) return [full];
  return readdirSync(full, { recursive: true })
    .map((n) => join(full, String(n)))
    .filter(
      (f) => /\.(tsx?|mjs)$/.test(f) && !/\.(test|stories)\./.test(f) && statSync(f).isFile(),
    );
};

// ── tiny CSV (RFC 4180) ──────────────────────────────────────────────────────────
const cell = (v) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
function parseCsv(text) {
  const rows = [];
  let row = [];
  let c = '';
  let q = false;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"' && s[i + 1] === '"') {
        c += '"';
        i++;
      } else if (ch === '"') q = false;
      else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      row.push(c);
      c = '';
    } else if (ch.charCodeAt(0) === 10 || ch.charCodeAt(0) === 13) {
      // LF or CR (CRLF counts once)
      if (ch.charCodeAt(0) === 13 && s.charCodeAt(i + 1) === 10) i++;
      row.push(c);
      rows.push(row);
      row = [];
      c = '';
    } else c += ch;
  }
  if (c !== '' || row.length) {
    row.push(c);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

// ── ICU checks (same rules as check-keys.mjs) ───────────────────────────────────
function argsOf(msg) {
  const out = new Set();
  const walk = (els) => {
    for (const el of els) {
      if ([TYPE.argument, TYPE.number, TYPE.date, TYPE.time].includes(el.type)) out.add(el.value);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        out.add(el.value);
        for (const o of Object.values(el.options)) walk(o.value);
      }
      if (el.type === TYPE.tag) walk(el.children);
    }
  };
  walk(parse(msg, { ignoreTag: false }));
  return out;
}

const [cmd, file] = process.argv.slice(2);
const en = read('en.json');
const ar = read('ar.json');

if (cmd === 'export') {
  const where = new Map();
  const weight = new Map();
  const add = (k, screen, w) => {
    where.set(k, new Set([...(where.get(k) ?? []), screen]));
    weight.set(k, (weight.get(k) ?? 0) + w);
  };
  for (const [p, screen, w] of SCREENS)
    for (const f of files(p)) {
      const src = readFileSync(f, 'utf8');
      const seen = new Set();
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g))
        if (m[1] in en && !seen.has(m[1])) {
          seen.add(m[1]);
          add(m[1], screen, w);
        }
    }
  // Shared state messages appear on every screen.
  for (const k of Object.keys(en))
    if (/^(states|common)\./.test(k) && !where.has(k)) add(k, 'All screens (states, common)', 5);
  // Strings the guides quote («…»): matched back to their key by the Arabic or English text.
  // Both sides normalised: no placeholders, no closing punctuation, single spaces. A quote may
  // also be the opening words of a longer screen string ("Signed …" for "Signed {date}").
  const plain = (v) =>
    String(v)
      .replace(/\{[^}]*\}/g, ' ')
      .replace(/[.…:،,()]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const texts = [];
  for (const k of Object.keys(en))
    for (const v of [ar[k], en[k]]) if (v && !/plural|select/.test(v)) texts.push([plain(v), k]);
  const keyFor = (quote) => {
    const q = plain(quote);
    if (q.length < 4) return null;
    return (
      texts.find(([v]) => v === q)?.[1] ??
      (q.length >= 8 ? texts.find(([v]) => v.startsWith(q))?.[1] : null) ??
      null
    );
  };
  const guideQuotes = [];
  for (const [g, label] of GUIDES) {
    const text = readFileSync(join(ROOT, g), 'utf8');
    for (const m of text.matchAll(/«([^»«]+)»/g)) {
      const k = keyFor(m[1]);
      if (k) add(k, label, 1);
    }
    guideQuotes.push([g, label, text]);
  }
  // Marketplace-only navigation is hidden in the pilot (marketplace off).
  for (const k of [
    'marketplace',
    'publicProfile',
    'roomSchedule',
    'reviews',
    'roomsRequests',
    'rentIncome',
  ])
    where.delete(`centre.nav.${k}`);
  const often = (w) =>
    w >= 10
      ? 'every day, many times'
      : w >= 4
        ? 'every day'
        : w >= 1.5
          ? 'most days'
          : 'now and then';
  const keys = [...where.keys()].sort(
    (a, b) => (weight.get(b) ?? 0) - (weight.get(a) ?? 0) || a.localeCompare(b),
  );
  const csv = [
    'key,english,current_arabic,screen,how_often,reviewed_arabic',
    ...keys.map((k) =>
      [k, en[k], ar[k], [...where.get(k)].join(' | '), often(weight.get(k) ?? 0), '']
        .map(cell)
        .join(','),
    ),
  ].join('\n');
  const out = resolve(
    process.env.INIT_CWD ?? process.cwd(),
    file ?? join(ROOT, 'docs', 'pilot', 'strings-to-review.csv'),
  );
  writeFileSync(out, '\ufeff' + csv + '\n'); // BOM: Excel opens Arabic CSV as UTF-8
  console.log(`✔ ${keys.length} strings → ${relative(process.cwd(), out)}`);

  // One sitting (4.5): the strings, the guides and the gold scripts, in one Markdown pack.
  if (!file) {
    const md = (v) =>
      String(v ?? '')
        .replace(/\|/g, '\\|')
        .replace(/\n/g, ' ');
    const scripts = parseCsv(readFileSync(join(ROOT, 'evals', 'gold', 'REVIEW.csv'), 'utf8'));
    const [sh, ...srows] = scripts;
    const si = (n) => sh.indexOf(n);
    const pack = [
      '# Arabic review pack (pilot) — one sitting',
      '',
      'For Ahmed (and a native Egyptian Arabic reviewer). Generated by `pnpm i18n:export-review`; do not edit by hand.',
      '',
      '**How to send your changes back:**',
      `- Screen strings: fill the \`reviewed_arabic\` column of [strings-to-review.csv](strings-to-review.csv) (only the rows you change), then run \`pnpm i18n:apply-review docs/pilot/strings-to-review.csv\`. It refuses broken placeholders, plurals or Western digits.`,
      '- Quick guides: edit the Arabic part of each guide directly; keep the «quoted screen words» identical to the screens (change the screen string first, then the guide).',
      `- Gold scripts: fill \`reviewed_text\` and \`approved\` in [evals/gold/REVIEW.csv](../../evals/gold/REVIEW.csv), then \`python -m link_eval apply-review evals/gold/REVIEW.csv\` (it bumps and re-locks gold).`,
      '',
      `## A. Screen strings (${keys.length}, most seen first)`,
      '',
      '| # | How often | Screen | English | Arabic now | Key |',
      '|---|---|---|---|---|---|',
      ...keys.map(
        (k, i) =>
          `| ${i + 1} | ${often(weight.get(k) ?? 0)} | ${md([...where.get(k)].slice(0, 2).join(', '))} | ${md(en[k])} | ${md(ar[k])} | \`${k}\` |`,
      ),
      '',
      '## B. Staff quick guides (Arabic part)',
      '',
      ...guideQuotes.flatMap(([g, label, text]) => {
        const arabic = /<div dir="rtl"[^>]*>([\s\S]*?)<\/div>/.exec(text)?.[1] ?? '';
        return [
          `### ${label} — [${g.split('/').pop()}](${g.split('/').pop()})`,
          '',
          arabic.trim(),
          '',
        ];
      }),
      `## C. Gold scripts (${srows.length}, from evals/gold/REVIEW.csv)`,
      '',
      '| Id | Script | Notes for the reviewer |',
      '|---|---|---|',
      ...srows.map(
        (r) =>
          `| ${md(r[si('id')])} | ${md(r[si('script_text')])} | ${md(r[si('notes_for_reviewer')])} |`,
      ),
      '',
    ].join('\n');
    writeFileSync(join(ROOT, 'docs', 'pilot', 'arabic-review.md'), pack);
    console.log(
      `✔ review pack → docs/pilot/arabic-review.md (${keys.length} strings, 3 guides, ${srows.length} scripts)`,
    );
  }
} else if (cmd === 'apply' && file) {
  const rows = parseCsv(readFileSync(resolve(process.env.INIT_CWD ?? process.cwd(), file), 'utf8'));
  const head = rows[0].map((h) => h.trim());
  const ki = head.indexOf('key');
  const ri = head.indexOf('reviewed_arabic');
  if (ki < 0 || ri < 0) throw new Error('The CSV needs the columns "key" and "reviewed_arabic".');
  const proposed = read('proposed.ar.json');
  const errors = [];
  let changed = 0;
  for (const r of rows.slice(1)) {
    const k = r[ki]?.trim();
    const v = (r[ri] ?? '').trim();
    if (!k || !v) continue;
    if (!(k in en)) {
      errors.push(`${k}: unknown key`);
      continue;
    }
    let ok = true;
    try {
      const want = [...argsOf(en[k])].sort().join(',');
      const got = [...argsOf(v)].sort().join(',');
      if (want !== got) {
        errors.push(`${k}: placeholders must be {${want}}, found {${got}}`);
        ok = false;
      }
      if (/plural/.test(en[k]) && !/few|many/.test(v)) {
        errors.push(`${k}: Arabic plural needs few and many`);
        ok = false;
      }
    } catch (e) {
      errors.push(`${k}: not a valid ICU message (${e.message})`);
      ok = false;
    }
    if (/[0-9]/.test(v.replace(/\{[^}]*\}/g, ''))) {
      errors.push(`${k}: use Arabic-Indic digits (٠–٩) in Arabic copy`);
      ok = false;
    }
    if (!ok) continue;
    if (ar[k] !== v) changed++;
    ar[k] = v;
    const i = proposed.indexOf(k);
    if (i >= 0) proposed.splice(i, 1); // reviewed by a native speaker
  }
  if (errors.length) {
    console.error(
      `✖ Not applied — fix these rows and run again:\n${errors.map((e) => `  - ${e}`).join('\n')}`,
    );
    process.exit(1);
  }
  write('ar.json', ar);
  write('proposed.ar.json', proposed);
  console.log(`✔ ${changed} Arabic strings updated; reviewed keys taken off the proposed list.`);
} else {
  console.error('Usage: review-strings.mjs export [out.csv] | apply <reviewed.csv>');
  process.exit(1);
}
