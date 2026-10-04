// Arabic review round-trip (pilot A11).
//
//   node review-strings.mjs export [out.csv]   — every string on the pilot screens and the Demo Day
//                                                path: key, English, current Arabic, screen, and an
//                                                empty "reviewed_arabic" column (default:
//                                                docs/pilot/strings-to-review.csv).
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

/** Source files of the pilot screens and the Demo Day path → the screen they belong to. */
const SCREENS = [
  ['apps/web/src/owner/screens/CentreSignIn.tsx', 'Centre sign-in (pilot PIN)'],
  ['apps/web/src/owner/screens/Today.tsx', 'A01 Today'],
  ['apps/web/src/owner/screens/FollowUps.tsx', 'A02 Follow-ups'],
  ['apps/web/src/owner/screens/Case.tsx', 'A03 Follow-up case'],
  ['apps/web/src/owner/screens/Message.tsx', 'A06/A09 Parent message'],
  ['apps/web/src/owner/screens/Reply.tsx', 'V06 Parent replied (demo)'],
  ['apps/web/src/owner/screens/Outcome.tsx', 'A08/A10 Outcome'],
  ['apps/web/src/owner/screens/Communication.tsx', 'A11 Parent communication'],
  ['apps/web/src/owner/screens/Students.tsx', 'A13 Students'],
  ['apps/web/src/owner/screens/Student.tsx', 'A04 Student'],
  ['apps/web/src/owner/screens/Sessions.tsx', 'A05/A14 Sessions'],
  ['apps/web/src/owner/screens/Rules.tsx', 'A07 Rules'],
  ['apps/web/src/owner/screens/Staff.tsx', 'A16 Staff'],
  ['apps/web/src/owner/screens/PilotPeople.tsx', 'A16 People (pilot)'],
  ['apps/web/src/owner/screens/Activity.tsx', 'A17 Activity'],
  ['apps/web/src/owner/AssistantPanel.tsx', 'V07/V03 Ask Link (demo)'],
  ['apps/web/src/owner/common.tsx', 'Owner web (shared)'],
  ['apps/web/src/CentreShell.tsx', 'Owner web (navigation)'],
  ['apps/web/src/parent/screens/P09Children.tsx', 'P09 My children (demo)'],
  ['apps/teacher-app/app/sign-in.tsx', 'Teacher sign-in'],
  ['apps/teacher-app/src/screens/PilotSignIn.tsx', 'Teacher sign-in (pilot PIN)'],
  ['apps/teacher-app/app/(tabs)', 'T01/T09 Teacher tabs'],
  ['apps/teacher-app/app/record', 'T02–T08 Session record'],
  ['apps/teacher-app/app/group', 'T10/T13 Group'],
  ['apps/teacher-app/app/student', 'T11/T12 Student'],
  ['apps/teacher-app/src/screens', 'T13 Records history'],
  ['apps/teacher-app/src/ui', 'Teacher app (shared)'],
  ['apps/teacher-app/src/format.ts', 'Teacher app (shared)'],
  ['packages/ui/src', 'Shared components'],
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
  for (const [p, screen] of SCREENS)
    for (const f of files(p)) {
      const src = readFileSync(f, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g))
        if (m[1] in en) where.set(m[1], new Set([...(where.get(m[1]) ?? []), screen]));
    }
  // Shared state messages appear on every screen.
  for (const k of Object.keys(en))
    if (/^(states|common)\./.test(k) && !where.has(k))
      where.set(k, new Set(['All screens (states, common)']));
  // Marketplace-only navigation is hidden in the pilot and the MVP demo (marketplace off).
  for (const k of [
    'marketplace',
    'publicProfile',
    'roomSchedule',
    'reviews',
    'roomsRequests',
    'rentIncome',
  ])
    where.delete(`centre.nav.${k}`);
  // Screen by screen, so a reviewer can follow the app.
  const order = SCREENS.map(([, s]) => s);
  const rank = (k) =>
    Math.min(...[...where.get(k)].map((s) => (order.includes(s) ? order.indexOf(s) : 99)));
  const keys = [...where.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const csv = [
    'key,english,current_arabic,screen,reviewed_arabic',
    ...keys.map((k) => [k, en[k], ar[k], [...where.get(k)].join(' | '), ''].map(cell).join(',')),
  ].join('\n');
  const out = resolve(
    process.env.INIT_CWD ?? process.cwd(),
    file ?? join(ROOT, 'docs', 'pilot', 'strings-to-review.csv'),
  );
  writeFileSync(out, '﻿' + csv + '\n'); // BOM: Excel opens Arabic CSV as UTF-8
  console.log(`✔ ${keys.length} strings → ${relative(process.cwd(), out)}`);
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
