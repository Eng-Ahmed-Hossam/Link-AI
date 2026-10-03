// RTL-11: fail on missing translation keys (EN <-> AR), mismatched ICU placeholders,
// stale entries in the "proposed" review list, and Western digits in Arabic copy (RTL-04).
import { readFileSync } from 'node:fs';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const en = read('en.json');
const ar = read('ar.json');
const proposed = read('proposed.ar.json').filter((k) => k in ar || !k.includes(' '));

const errors = [];
for (const k of Object.keys(en)) if (!(k in ar)) errors.push(`missing in ar: ${k}`);
for (const k of Object.keys(ar)) if (!(k in en)) errors.push(`missing in en: ${k}`);
for (const k of proposed) if (!(k in ar)) errors.push(`proposed list names unknown key: ${k}`);

/** Walks an ICU message: calls `onArg(name)` for arguments and `onText(text)` for literal text. */
function walkIcu(msg, { onArg = () => {}, onText = () => {} }) {
  const walk = (els) => {
    for (const el of els) {
      if (el.type === TYPE.literal) onText(el.value);
      if (
        el.type === TYPE.argument ||
        el.type === TYPE.number ||
        el.type === TYPE.date ||
        el.type === TYPE.time
      )
        onArg(el.value);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        onArg(el.value);
        for (const o of Object.values(el.options)) walk(o.value);
      }
    }
  };
  try {
    walk(parse(msg));
  } catch (e) {
    errors.push(`ICU syntax error: ${e.message} in "${msg}"`);
  }
}

// Argument names (at any depth) must match between languages. Parsed with the ICU parser,
// so plural option bodies such as `one {centre}` are not mistaken for arguments.
const args = (msg) => {
  const out = new Set();
  walkIcu(msg, { onArg: (a) => out.add(a) });
  return [...out].sort().join();
};
for (const k of Object.keys(en)) {
  if (!(k in ar)) continue;
  const a = args(en[k]);
  const b = args(ar[k]);
  if (a !== b) errors.push(`placeholder mismatch in ${k}: en {${a}} vs ar {${b}}`);
  if (/plural/.test(en[k]) && !/few|many/.test(ar[k]))
    errors.push(`ar plural missing few/many forms: ${k}`);
}

// RTL-04: Arabic copy uses Arabic-Indic digits. Western digits are allowed only in codes shown as
// LTR isolates: decision and story IDs (OD-46), screen IDs (C01), +20, and the phone placeholder.
const LTR_OK = /(OD|CF|BR|MKT|FUP|ANL)-\d+|\b[A-Z]\d{1,2}\b|\+20|^10 1234 5678$/g;
for (const [k, v] of Object.entries(ar)) {
  const text = [];
  walkIcu(v, { onText: (s) => text.push(s) });
  if (/[0-9]/.test(text.join(' ').replace(LTR_OK, '')))
    errors.push(`Western digits in Arabic copy (use ٠–٩ or a {n, number} argument): ${k}`);
}

if (errors.length) {
  console.error(`i18n check failed (${errors.length}):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(
  `i18n check: ${Object.keys(en).length} keys, EN and AR match; ${proposed.length - 1} AR strings flagged for copywriter review.`,
);
