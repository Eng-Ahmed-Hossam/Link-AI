import { createHmac, timingSafeEqual } from 'node:crypto';
import { Problem } from '../platform/problem';

/**
 * `PaymentProvider` (docs/05 §7). The only implementation in this phase is the fake that talks to
 * the local fake-pay (docs/14 §2): sample money, nothing reaches a bank. Card data never touches
 * Link (BR-MNY-06): the provider hosts the card form, and Link keeps only opaque token IDs.
 * No provider type leaks outside this file: the rest of core-api sees `ProviderEvent`.
 */

export interface CheckoutOrder {
  /** Link's payment ID. */
  orderRef: string;
  amountPt: number;
  method: 'card' | 'wallet';
  /** Where the hosted page sends the parent back (status still comes only from the webhook). */
  returnUrl: string;
  /** Monthly plan: save the card for renewals (BR-PMT-02). */
  saveCard: boolean;
}

/** What a verified webhook says, in Link's terms. */
export type ProviderEvent =
  | {
      kind: 'payment.succeeded';
      eventId: string;
      providerRef: string;
      orderRef: string;
      amountPt: number;
      method: 'card' | 'wallet' | 'fawry';
      cardLast4: string | null;
      mandate: {
        tokenRef: string;
        brand: string;
        last4: string;
        expMonth: number;
        expYear: number;
      } | null;
    }
  | {
      kind: 'payment.failed';
      eventId: string;
      providerRef: string;
      orderRef: string;
      reason: string | null;
    }
  | { kind: 'payment.expired'; eventId: string; providerRef: string; orderRef: string }
  | {
      kind: 'refund.succeeded' | 'refund.failed';
      eventId: string;
      refundRef: string;
      providerRef: string;
      amountPt: number;
    }
  | { kind: 'unknown'; eventId: string; type: string };

export interface SettlementLine {
  providerRef: string;
  kind: 'payment' | 'refund';
  amountPt: number;
  feePt: number;
}

export interface PaymentProvider {
  readonly name: 'fake' | 'none';
  createCheckout(o: CheckoutOrder): Promise<{ providerRef: string; url: string }>;
  createFawryReference(o: {
    orderRef: string;
    amountPt: number;
    expiresAt: Date;
  }): Promise<{ reference: string; expiresAt: Date }>;
  chargeMandate(
    tokenRef: string,
    o: { orderRef: string; amountPt: number; idemKey: string },
  ): Promise<{ providerRef: string }>;
  revokeMandate(tokenRef: string): Promise<void>;
  refund(paymentRef: string, amountPt: number, idemKey: string): Promise<{ refundRef: string }>;
  /** Ask the provider to close an unpaid checkout or Fawry reference (hold ran out). */
  expire(providerRef: string, method: 'card' | 'wallet' | 'fawry'): Promise<void>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): boolean;
  parseWebhook(rawBody: Buffer): ProviderEvent;
  fetchSettlementReport(date: string): Promise<SettlementLine[]>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** The adapter for fake-pay: a 5-second timeout on every call; failures become 502. */
export class FakePayProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  constructor(
    private readonly baseUrl: string,
    private readonly secret: string,
  ) {}

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new Problem(
        502,
        'provider_unavailable',
        'The payment provider is not answering. Try again.',
      );
    }
    if (!res.ok)
      throw new Problem(
        502,
        'provider_error',
        `The payment provider refused the request (${res.status}).`,
      );
    return (await res.json()) as T;
  }

  async createCheckout(o: CheckoutOrder) {
    const r = await this.call<{ checkoutId: string; url: string }>('POST', '/v1/checkouts', o);
    return { providerRef: r.checkoutId, url: r.url };
  }

  async createFawryReference(o: { orderRef: string; amountPt: number; expiresAt: Date }) {
    const r = await this.call<{ reference: string; expiresAt: string }>(
      'POST',
      '/v1/fawry-references',
      {
        ...o,
        expiresAt: o.expiresAt.toISOString(),
      },
    );
    return { reference: r.reference, expiresAt: new Date(r.expiresAt) };
  }

  async chargeMandate(
    tokenRef: string,
    o: { orderRef: string; amountPt: number; idemKey: string },
  ) {
    const r = await this.call<{ chargeRef: string }>(
      'POST',
      `/v1/mandates/${encodeURIComponent(tokenRef)}/charges`,
      { orderRef: o.orderRef, amountPt: o.amountPt, idempotencyKey: o.idemKey },
    );
    return { providerRef: r.chargeRef };
  }

  async revokeMandate(tokenRef: string) {
    await this.call('POST', `/v1/mandates/${encodeURIComponent(tokenRef)}/revoke`, {});
  }

  async refund(paymentRef: string, amountPt: number, idemKey: string) {
    const r = await this.call<{ refundRef: string }>('POST', '/v1/refunds', {
      paymentRef,
      amountPt,
      idempotencyKey: idemKey,
    });
    return { refundRef: r.refundRef };
  }

  async expire(providerRef: string, method: 'card' | 'wallet' | 'fawry') {
    const path =
      method === 'fawry'
        ? `/v1/fawry-references/${encodeURIComponent(providerRef)}/expire`
        : `/v1/checkouts/${encodeURIComponent(providerRef)}/expire`;
    await this.call('POST', path, {});
  }

  /** `x-fake-pay-signature: sha256=<hex HMAC-SHA256 of the raw body>` (docs/14 §2). */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer) {
    const got = headers['x-fake-pay-signature'];
    if (typeof got !== 'string' || !got.startsWith('sha256=')) return false;
    const want = createHmac('sha256', this.secret).update(rawBody).digest();
    const given = Buffer.from(got.slice(7), 'hex');
    return given.length === want.length && timingSafeEqual(given, want);
  }

  parseWebhook(rawBody: Buffer): ProviderEvent {
    const e = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown> & {
      eventId: string;
      type: string;
    };
    const str = (k: string) => String(e[k] ?? '');
    switch (e.type) {
      case 'payment.succeeded': {
        const card = e.card as { last4?: string } | null;
        return {
          kind: 'payment.succeeded',
          eventId: e.eventId,
          providerRef: str('providerRef'),
          orderRef: str('orderRef'),
          amountPt: Number(e.amountPt),
          method: str('method') as 'card' | 'wallet' | 'fawry',
          cardLast4: card?.last4 ?? null,
          mandate: (e.mandate as never) ?? null,
        };
      }
      case 'payment.failed':
        return {
          kind: 'payment.failed',
          eventId: e.eventId,
          providerRef: str('providerRef'),
          orderRef: str('orderRef'),
          reason: (e.reason as string | null) ?? null,
        };
      case 'payment.expired':
        return {
          kind: 'payment.expired',
          eventId: e.eventId,
          providerRef: str('providerRef'),
          orderRef: str('orderRef'),
        };
      case 'refund.succeeded':
      case 'refund.failed':
        return {
          kind: e.type,
          eventId: e.eventId,
          refundRef: str('refundRef'),
          providerRef: str('providerRef'),
          amountPt: Number(e.amountPt),
        };
      default:
        return { kind: 'unknown', eventId: e.eventId, type: e.type };
    }
  }

  async fetchSettlementReport(date: string) {
    const r = await this.call<{ lines: SettlementLine[] }>('GET', `/v1/settlements?date=${date}`);
    return r.lines;
  }
}

/**
 * PAYMENT_PROVIDER=none: no payment provider yet (a Follow-up-only pilot, ship job S3's
 * `bookingsEnabled` off). Every money call answers 503 `payments_off`; nothing is charged, and no
 * webhook is ever accepted. Reading earnings and the ledger still works.
 */
export class NoPaymentProvider implements PaymentProvider {
  readonly name = 'none' as const;
  private off(): never {
    throw new Problem(503, 'payments_off', 'Payments are not switched on yet.');
  }
  createCheckout(): Promise<{ providerRef: string; url: string }> {
    this.off();
  }
  createFawryReference(): Promise<{ reference: string; expiresAt: Date }> {
    this.off();
  }
  chargeMandate(): never {
    this.off();
  }
  revokeMandate(): Promise<void> {
    return Promise.resolve();
  }
  refund(): Promise<{ refundRef: string }> {
    this.off();
  }
  expire(): Promise<void> {
    return Promise.resolve();
  }
  verifyWebhook() {
    return false;
  }
  parseWebhook(): ProviderEvent {
    this.off();
  }
  fetchSettlementReport(): Promise<SettlementLine[]> {
    return Promise.resolve([]);
  }
}
