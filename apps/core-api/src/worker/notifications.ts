import { createTranslator } from '@link/i18n';
import type { SmsSender } from '../adapters/sms';
import type { Phones } from '../identity/phone';
import type { Tx } from '../platform/db';
import type { EventEnvelope } from '../platform/outbox';

/**
 * The `notifications` consumer (docs/05 §4). In R1 it sends the staff-invite SMS (MKT-ACC-06):
 * the phone is decrypted here, at the last moment, and never logged.
 */
export function notificationsHandler(sms: SmsSender, phones: Phones) {
  return async (tx: Tx, e: EventEnvelope) => {
    if (e.type !== 'staff.invited') return;
    const { roleAssignmentId } = e.data as { roleAssignmentId: string };
    const row = await tx
      .selectFrom('identity.role_assignments as ra')
      .innerJoin('identity.users as u', 'u.id', 'ra.user_id')
      .select(['ra.status', 'ra.centre_id', 'u.phone_enc', 'u.language'])
      .where('ra.id', '=', roleAssignmentId)
      .executeTakeFirst();
    if (!row || row.status === 'revoked' || !row.centre_id) return;
    const centre = await tx
      .selectFrom('org.centres')
      .select('name')
      .where('id', '=', row.centre_id)
      .executeTakeFirst();
    const t = createTranslator(row.language === 'en' ? 'en' : 'ar');
    await sms.send({
      to: phones.decrypt(row.phone_enc),
      body: t('sms.staffInvite.body', { centre: centre?.name ?? '' }),
      templateCode: 'staff_invite',
    });
  };
}
