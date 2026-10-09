import type { Phones } from '../identity/phone';
import { toE164 } from '../identity/phone';
import { writeAudit } from '../platform/audit';
import type { Database } from '../platform/db';
import { isUuid } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem } from '../platform/problem';

/**
 * LOCAL stand-in for Link ops verifying a centre (MKT-OPS-01; the ops console comes later). Used by
 * `pnpm ops:verify-centre <centreId|phone>` and the local Demo tools; neither exists outside
 * APP_ENV=local. The centre becomes `verified` (searchable, takes requests and bookings) and a
 * moved pin stops being "under review" (CF-44). Audited in the same transaction.
 */
export async function verifyCentre(
  db: Database,
  phones: Phones,
  ref: string,
  how: 'ops_cli' | 'demo_tools',
) {
  return db.asSystem(async (tx) => {
    let ids: string[];
    if (isUuid(ref)) ids = [ref];
    else {
      const owner = await tx
        .selectFrom('identity.users')
        .select('id')
        .where('phone_hmac', '=', phones.hmac(toE164(ref)))
        .executeTakeFirst();
      if (!owner) throw new Problem(404, 'not_found', 'No account has this phone number.');
      const rows = await tx
        .selectFrom('identity.role_assignments')
        .select('centre_id')
        .where('user_id', '=', owner.id)
        .where('role', '=', 'centre_owner')
        .where('status', '=', 'active')
        .execute();
      ids = rows.map((r) => r.centre_id!).filter(Boolean);
    }
    const centres = ids.length
      ? await tx
          .selectFrom('org.centres')
          .select(['id', 'name', 'verification', 'location_status'])
          .where('id', 'in', ids)
          .execute()
      : [];
    if (!centres.length) throw new Problem(404, 'not_found', 'No such centre.');
    for (const c of centres) {
      if (c.verification === 'verified' && c.location_status === 'verified') continue;
      await tx
        .updateTable('org.centres')
        .set({ verification: 'verified', verified_at: new Date(), location_status: 'verified' })
        .where('id', '=', c.id)
        .execute();
      await writeAudit(tx, {
        actorId: null,
        actorType: 'system',
        centreId: c.id,
        action: 'centre.verified',
        objectType: 'centre',
        objectRef: c.id,
        before: { verification: c.verification, locationStatus: c.location_status },
        after: { verification: 'verified', locationStatus: 'verified' },
        reason:
          how === 'ops_cli'
            ? 'Local ops tool: pnpm ops:verify-centre (stands in for the ops console)'
            : 'Local Demo tools (stands in for the ops console)',
      });
      await enqueue(tx, {
        type: 'centre.verified',
        aggregateType: 'centre',
        aggregateId: c.id,
        centreId: c.id,
        data: { centreId: c.id },
      });
    }
    return centres.map((c) => ({ id: c.id, name: c.name, verification: 'verified' as const }));
  });
}

/** Pending centres and moved pins waiting for ops (for the local Demo tools list). */
export async function pendingCentres(db: Database) {
  return db.asSystem(async (tx) =>
    (
      await tx
        .selectFrom('org.centres')
        .select(['id', 'name', 'verification', 'location_status', 'created_at'])
        .where((w) =>
          w.or([w('verification', '<>', 'verified'), w('location_status', '=', 'under_review')]),
        )
        .orderBy('created_at')
        .execute()
    ).map((c) => ({
      id: c.id,
      name: c.name,
      pendingVerification: c.verification !== 'verified',
      locationUnderReview: c.location_status === 'under_review',
    })),
  );
}
