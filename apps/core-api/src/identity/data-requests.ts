import { writeAudit } from '../platform/audit';
import type { Database } from '../platform/db';
import { uuidv7 } from '../platform/ids';
import { enqueue } from '../platform/outbox';
import { Problem, pgConstraint } from '../platform/problem';
import { dataRequestView } from '../ops/console';

/**
 * Data-subject requests (PDPL Law 151/2020, MKT-OPS-09, 10 §3): anyone signed in asks Link for a
 * copy of their data, a correction or deletion. Ops complete it in the console and record what
 * was done; financial and audit records the law requires are kept with personal fields
 * anonymised. One open request of each kind at a time.
 */
export class DataRequests {
  constructor(private readonly db: Database) {}

  list(userId: string) {
    return this.db.asUser(userId, async (tx) =>
      (
        await tx
          .selectFrom('identity.data_requests')
          .select(['id', 'kind', 'details', 'status', 'outcome', 'created_at', 'completed_at'])
          .where('user_id', '=', userId)
          .orderBy('created_at', 'desc')
          .execute()
      ).map(dataRequestView),
    );
  }

  async create(
    userId: string,
    b: { kind: 'access' | 'correction' | 'deletion'; details: string },
    requestId?: string,
  ) {
    try {
      return await this.db.asUser(userId, async (tx) => {
        const id = uuidv7();
        const row = await tx
          .insertInto('identity.data_requests')
          .values({ id, user_id: userId, kind: b.kind, details: b.details })
          .returning(['id', 'kind', 'details', 'status', 'outcome', 'created_at', 'completed_at'])
          .executeTakeFirstOrThrow();
        await writeAudit(tx, {
          actorId: userId,
          actorType: 'user',
          action: 'data_request.created',
          objectType: 'data_request',
          objectRef: id,
          after: { kind: b.kind },
          requestId,
        });
        await enqueue(tx, {
          type: 'data_request.created',
          aggregateType: 'data_request',
          aggregateId: id,
          data: { dataRequestId: id, kind: b.kind },
          requestId,
        });
        return dataRequestView(row);
      });
    } catch (e) {
      if (pgConstraint(e) === 'data_requests_one_open')
        throw new Problem(409, 'already_open', 'You already have an open request of this kind.');
      throw e;
    }
  }
}
