// pnpm scenario:demo-followup — reset the running mock server to the demo-followup scenario and
// print what it contains. Start the server first with `pnpm mock:server` (or `pnpm demo`).
const MOCK = process.env.MOCK_SERVER_URL ?? 'http://localhost:4010';
try {
  await fetch(`${MOCK}/__demo/reset`, { method: 'POST', body: '{}' });
} catch {
  console.error(`No mock server at ${MOCK}. Start it with: pnpm mock:server`);
  process.exit(1);
}
const s = await (await fetch(`${MOCK}/__demo/state`)).json();
console.log(`Scenario demo-followup reset on ${MOCK}
  Al Nour Centre · Ms Salma · Secondary 2 · Maths (18 students)
  ${s.records.confirmed} confirmed records · flags: ${s.signals.map((x) => `${x.student} (${x.rule})`).join(', ') || 'none'}
  Next: record today's session in the teacher app (voice note: Mariam absent → consecutive_absences).`);
