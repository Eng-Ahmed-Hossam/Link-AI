/**
 * `SmsSender` (docs/05 §7). The only implementation in this phase is the fake that posts to the
 * local sms-sink (docs/14 §2): nothing is ever delivered. A real provider (OD-45) implements the
 * same interface; `SMS_PROVIDER=fake` is refused in prod by the config.
 */
export interface SmsMessage {
  /** E.164, e.g. +201000000003. */
  to: string;
  body: string;
  templateCode: 'otp' | 'staff_invite';
}

export interface SmsSender {
  send(msg: SmsMessage): Promise<{ providerMessageId: string }>;
}

export class SmsSinkSender implements SmsSender {
  constructor(private readonly baseUrl: string) {}

  async send(msg: SmsMessage) {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`sms-sink answered ${res.status}`);
    const { id } = (await res.json()) as { id: string };
    return { providerMessageId: id };
  }
}

export const SMS_SENDER = Symbol('SMS_SENDER');
