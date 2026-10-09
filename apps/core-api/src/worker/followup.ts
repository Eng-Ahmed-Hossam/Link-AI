import type { Messages } from '../followup/messages';
import { evaluate } from '../followup/rules';
import type { Voice } from '../followup/voice';
import type { Tx } from '../platform/db';
import type { EventEnvelope } from '../platform/outbox';
import type { Job } from './jobs';

/**
 * R3 consumers (docs/05 §4, ADR-0003). Each is idempotent: the inbox dedupes a delivery, and the
 * work itself is safe to repeat (a second evaluation adds no flag — INV-08; a note already handed
 * over is skipped; a message with a provider ID is never sent twice).
 */

/** `followup`: record.confirmed / record.corrected / note.saved → the rules (FUP-RUL-03). */
export function followupHandler() {
  return async (tx: Tx, e: EventEnvelope) => {
    if (e.type === 'record.confirmed' || e.type === 'record.corrected') {
      const { recordId, groupId } = e.data as { recordId: string; groupId: string };
      const r = await tx
        .selectFrom('records.session_records')
        .select(['status', 'session_date'])
        .where('id', '=', recordId)
        .executeTakeFirst();
      if (r?.status !== 'confirmed') return; // only confirmed records trigger rules (BR-APR-08)
      const students = await tx
        .selectFrom('records.record_entries')
        .select('student_id')
        .where('session_record_id', '=', recordId)
        .execute();
      await evaluate(tx, {
        groupId,
        studentIds: students.map((s) => s.student_id),
        trigger: 'record',
        correctionOf: e.type === 'record.corrected' ? recordId : undefined,
        upto:
          e.type === 'record.confirmed'
            ? (e.data as { sessionDate?: string }).sessionDate
            : undefined,
        requestId: e.requestId,
      });
    }
    if (e.type === 'note.saved') {
      const { groupId, studentId } = e.data as { groupId: string; studentId: string };
      await evaluate(tx, {
        groupId,
        studentIds: [studentId],
        trigger: 'note',
        requestId: e.requestId,
      });
    }
  };
}

/** `voice`: voice.uploaded → ai-service (after the inbox row commits; the call is not in the tx). */
export function voiceHandler(voice: Voice, later: (fn: () => Promise<unknown>) => void) {
  return async (_tx: Tx, e: EventEnvelope) => {
    if (e.type !== 'voice.uploaded') return;
    const { voiceNoteId } = e.data as { voiceNoteId: string };
    later(() => voice.dispatch(voiceNoteId));
  };
}

/** `messaging` (the messaging-gateway): message.approved → WhatsAppSender. */
export function messagingHandler(messages: Messages, later: (fn: () => Promise<unknown>) => void) {
  return async (_tx: Tx, e: EventEnvelope) => {
    if (e.type !== 'message.approved') return;
    const { messageId } = e.data as { messageId: string };
    later(() => messages.send(messageId));
  };
}

export function followupJobs(d: { voice: Voice; messages: Messages }): Job[] {
  return [
    // docs/10 §4: audio 30 days after upload, transcripts 90; daily, rerun-safe.
    { name: 'voice-retention', dailyAt: '04:00', run: () => d.voice.retention() },
    // Queued messages the gateway has not handed over (a lost delivery or a failed call).
    { name: 'messages-send-pending', everyMs: 60_000, run: () => d.messages.sendPending() },
  ];
}
