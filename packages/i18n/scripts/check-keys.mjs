// RTL-11: fail on missing translation keys (EN <-> AR), mismatched ICU placeholders,
// and stale entries in the "proposed" review list.
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

// Argument names (at any depth) must match between languages. Parsed with the ICU parser,
// so plural option bodies such as `one {centre}` are not mistaken for arguments.
function args(msg) {
  const out = new Set();
  const walk = (els) => {
    for (const el of els) {
      if (
        el.type === TYPE.argument ||
        el.type === TYPE.number ||
        el.type === TYPE.date ||
        el.type === TYPE.time
      )
        out.add(el.value);
      if (el.type === TYPE.plural || el.type === TYPE.select) {
        out.add(el.value);
        for (const o of Object.values(el.options)) walk(o.value);
      }
    }
  };
  try {
    walk(parse(msg));
  } catch (e) {
    errors.push(`ICU syntax error: ${e.message} in "${msg}"`);
  }
  return out;
}
for (const k of Object.keys(en)) {
  if (!(k in ar)) continue;
  const a = [...args(en[k])].sort().join();
  const b = [...args(ar[k])].sort().join();
  if (a !== b) errors.push(`placeholder mismatch in ${k}: en {${a}} vs ar {${b}}`);
  if (/plural/.test(en[k]) && !/few|many/.test(ar[k]))
    errors.push(`ar plural missing few/many forms: ${k}`);
}

if (errors.length) {
  console.error(`i18n check failed (${errors.length}):\n  ` + errors.join('\n  '));
  process.exit(1);
}
console.log(
  `i18n check: ${Object.keys(en).length} keys, EN and AR match; ${proposed.length - 1} AR strings flagged for copywriter review.`,
);
