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
  const base = 'http://localhost:3000';
  for (const lang of ['ar', 'en'])
    for (const r of ROUTES) await fetch(`${base}/${lang}/${r}`).catch(() => undefined);
}
