// pnpm demo:warm — after `pnpm demo` is up, request every page on the Demo Day path once, so the
// dev servers compile them before the audience is watching (no cold-compile pause on stage).
// Each page's scripts are fetched too: Turbopack and Metro compile on the first request.

const WEB = process.env.DEMO_WEB_URL ?? 'http://localhost:3000';
const TEACHER = process.env.DEMO_TEACHER_URL ?? 'http://localhost:8081';
const MOCK = process.env.MOCK_SERVER_URL ?? 'http://localhost:4010';
const C = '/centre/cen-nour';

const webPages = ['ar', 'en'].flatMap((l) => [
  `/${l}/centre`,
  `/${l}${C}/today`,
  `/${l}${C}/follow-ups`,
  `/${l}${C}/students`,
  `/${l}${C}/sessions`,
  `/${l}${C}/communication`,
  `/${l}${C}/rules`,
  `/${l}${C}/activity`,
  `/${l}${C}/staff`,
  `/${l}/children`,
]);

async function get(url) {
  const t = Date.now();
  try {
    const r = await fetch(url);
    const body = r.headers.get('content-type')?.includes('text/html') ? await r.text() : '';
    await r.arrayBuffer().catch(() => {});
    return { ok: r.ok, status: r.status, ms: Date.now() - t, body };
  } catch (e) {
    return { ok: false, status: 0, ms: Date.now() - t, body: '', error: String(e) };
  }
}
const scripts = (html, base) =>
  [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => new URL(m[1], base).href);

async function warm(base, path) {
  const r = await get(base + path);
  const js = await Promise.all(scripts(r.body, base).map((u) => get(u)));
  const slowest = Math.max(r.ms, ...js.map((x) => x.ms));
  console.log(
    `${r.ok ? '✔' : '✖'} ${String(r.status).padEnd(3)} ${String(slowest).padStart(6)} ms  ${base}${path}`,
  );
  return r.ok;
}

const up = await get(`${MOCK}/__demo/state`);
if (!up.ok) {
  console.error(
    `✖ The demo is not running (${MOCK}). Start it with pnpm demo, then run pnpm demo:warm.`,
  );
  process.exit(1);
}
let ok = true;
for (const p of webPages) ok = (await warm(WEB, p)) && ok;
// One case and one message page (dynamic routes compile once for every id).
const s = await (await fetch(`${MOCK}/__demo/state`)).json();
if (s.cases?.[0]) {
  ok = (await warm(WEB, `/ar${C}/follow-ups/${s.cases[0].id}`)) && ok;
  ok = (await warm(WEB, `/ar${C}/follow-ups/${s.cases[0].id}/outcome`)) && ok;
}
ok = (await warm(TEACHER, '/')) && ok;
console.log(
  ok ? '\n✔ Demo pages warmed.' : '\n✖ Some pages did not load — check the demo windows.',
);
process.exit(ok ? 0 : 1);
