import { sql } from 'kysely';
import type { Tx } from '../platform/db';

/**
 * Ops approval of a centre's location (CF-44, Part B): the owner's pending location becomes the
 * live, public one, and the pending columns are cleared. With nothing pending, the live location
 * stays and is marked verified. The same statement sets `verified`, so the review trigger keeps
 * it. Runs as app_ops (the ops console) or the migrator (the CLI and the demo routes).
 */
export async function approveLocation(tx: Tx, centreId: string) {
  await sql`
    UPDATE org.centres SET
      location            = COALESCE(pending_location, location),
      address             = CASE WHEN pending_location IS NULL THEN address ELSE pending_address END,
      governorate         = CASE WHEN pending_location IS NULL THEN governorate ELSE pending_governorate END,
      area                = CASE WHEN pending_location IS NULL THEN area ELSE pending_area END,
      street              = CASE WHEN pending_location IS NULL THEN street ELSE pending_street END,
      landmark            = CASE WHEN pending_location IS NULL THEN landmark ELSE pending_landmark END,
      pending_location    = NULL,
      pending_address     = NULL,
      pending_governorate = NULL,
      pending_area        = NULL,
      pending_street      = NULL,
      pending_landmark    = NULL,
      pending_at          = NULL,
      location_status     = 'verified'
    WHERE id = ${centreId}`.execute(tx);
}

/** The live and the pending location of a centre, for the ops side-by-side view. */
export const locationColumns = {
  live: [
    sql<number | null>`ST_Y(c.location::geometry)`.as('lat'),
    sql<number | null>`ST_X(c.location::geometry)`.as('lng'),
  ],
  pending: [
    sql<number | null>`ST_Y(c.pending_location::geometry)`.as('p_lat'),
    sql<number | null>`ST_X(c.pending_location::geometry)`.as('p_lng'),
  ],
} as const;
