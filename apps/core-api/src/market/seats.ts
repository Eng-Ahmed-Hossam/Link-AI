import type { Tx } from '../platform/db';

/**
 * Seats filled per group in its next session (BR-ENR-02: committed enrolments + live holds +
 * offered waitlist entries). Enrolments and holds arrive in R2b; until then no seat is taken, so
 * every group shows all its seats free. This is the one place R2b changes.
 */
export async function seatsFilled(_tx: Tx, groupIds: string[]): Promise<Map<string, number>> {
  return new Map(groupIds.map((id) => [id, 0]));
}

/** Seats left per session (cap − used). */
export async function seatsLeftBySession(
  _tx: Tx,
  sessions: { id: string; groupId: string; seatCap: number }[],
): Promise<Map<string, number>> {
  return new Map(sessions.map((s) => [s.id, s.seatCap]));
}
