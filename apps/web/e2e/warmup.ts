/**
 * Compiles every parent route once before the tests run, so the first test of a cold dev server
 * does not spend its 60 s timeout waiting for Turbopack.
 */
const ROUTES = [
  'welcome',
  'search',
  'search/results',
  'centres/al-nour-maadi',
  'teachers/salma-fathy-maths',
  'teachers/salma-fathy-maths/reserve',
  'reserve/enr-mariam-phys',
  'reserve/enr-mariam-phys/done',
  'enrolments/enr-mariam-phys/feedback',
  'children',
  'account',
];

export default async function warmup() {
  // These tests drive the in-browser mock (API mode `mock`). `pnpm demo` serves the web app in
  // `mock-server` mode on the same port, and Playwright would silently reuse it.
  const demo = await fetch('http://localhost:4010/__demo/state').then(
    () => true,
    () => false,
  );
  if (demo)
    throw new Error('Stop `pnpm demo` before the web e2e: it reuses the dev server on port 3000.');
  const base = 'http://localhost:3000';
  for (const lang of ['ar', 'en'])
    for (const r of ROUTES) await fetch(`${base}/${lang}/${r}`).catch(() => undefined);
}
