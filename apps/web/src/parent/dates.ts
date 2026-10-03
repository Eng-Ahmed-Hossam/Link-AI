/** Same Cairo calendar day next month, as an ISO instant (BR-PMT-04: a monthly period). */
export function addMonthIso(iso: string): string {
  const d = new Date(iso);
  const next = new Date(d);
  next.setUTCMonth(d.getUTCMonth() + 1);
  // Clamp (31 Jan → 28/29 Feb) like the backend's period rule.
  if (next.getUTCDate() !== d.getUTCDate()) next.setUTCDate(0);
  return next.toISOString();
}
