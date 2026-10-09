import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * `WhatsAppSender` (docs/05 adapters, R3). Locally the provider is **whatsapp-fake**: it accepts
 * approved messages and reports delivery only through signed webhooks, so a message's status moves
 * only on provider events (BR-APR-11). `manual`: Link sends nothing — staff send the approved text
 * themselves and press "I sent it" (a contact attempt, never a delivery; OD-56). The real WhatsApp
 * Business API comes after the trial (PRODUCT_BRIEF §5).
 */
export interface OutgoingMessage {
  to: string;
  body: string;
  /** Link's message ID: the provider dedupes on it, so a retried send never sends twice. */
  idempotencyKey: string;
}
export interface WhatsAppSender {
  readonly name: string;
  /** `manual` never sends: approval leaves the message `approved` for staff to send by hand. */
  readonly sends: boolean;
  send(m: OutgoingMessage): Promise<{ providerMessageId: string }>;
  /** Checks the signature on the exact bytes (before anything is parsed). */
  verifyWebhook(raw: Buffer, signature: string | undefined): boolean;
}
export const WHATSAPP_SENDER = Symbol('WHATSAPP_SENDER');

export class WhatsAppFakeSender implements WhatsAppSender {
  readonly name = 'whatsapp-fake';
  readonly sends = true;
  constructor(
    private readonly url: string,
    private readonly secret: string,
  ) {}

  async send(m: OutgoingMessage) {
    const r = await fetch(`${this.url}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        to: m.to,
        body: m.body,
        idempotencyKey: m.idempotencyKey,
        ref: m.idempotencyKey,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) throw new Error(`whatsapp-fake ${r.status}`);
    const b = (await r.json()) as { id: string };
    return { providerMessageId: b.id };
  }

  verifyWebhook(raw: Buffer, signature: string | undefined) {
    if (!signature) return false;
    const want = Buffer.from(
      `sha256=${createHmac('sha256', this.secret).update(raw).digest('hex')}`,
    );
    const got = Buffer.from(signature);
    return want.length === got.length && timingSafeEqual(want, got);
  }
}

export class ManualSender implements WhatsAppSender {
  readonly name = 'manual';
  readonly sends = false;
  async send(): Promise<{ providerMessageId: string }> {
    throw new Error('manual: staff send the message themselves');
  }
  verifyWebhook() {
    return false;
  }
}
