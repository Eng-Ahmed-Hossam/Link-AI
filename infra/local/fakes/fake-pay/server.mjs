// fake-pay: the local payment provider behind the `PaymentProvider` fake adapter (docs/14 §2).
// SAMPLE MONEY ONLY: nothing here talks to a bank. It plays a hosted-checkout provider with Fawry
// references, saved-card mandates, refunds and a settlement report, and signs every webhook.
//
// POST /v1/checkouts {orderRef, amountPt, returnUrl, saveCard, method}   -> {checkoutId, url}
// GET  /checkout/:id                     -> hosted page (NO card fields: it simulates the result)
// POST /checkout/:id/complete {result}   -> sends payment.succeeded|failed, redirects to returnUrl
// POST /v1/checkouts/:id/expire          -> sends payment.expired (if still open)
// POST /v1/fawry-references {orderRef, amountPt, expiresAt}             -> {reference, expiresAt}
// POST /v1/fawry-references/:ref/pay     -> the parent pays at an outlet: payment.succeeded, even
//                                           after the reference expired (a late payment, BR-ENR-06)
// POST /v1/fawry-references/:ref/expire  -> sends payment.expired (if still unpaid)
// POST /v1/mandates/:token/charges {orderRef, amountPt, idempotencyKey} -> {chargeRef}; the result
//                                           arrives as a webhook (see test controls)
// POST /v1/mandates/:token/revoke        -> {ok}
// POST /v1/refunds {paymentRef, amountPt, idempotencyKey}               -> {refundRef}; webhook later
// GET  /v1/payments/:ref                 -> {status, amountPt}
// GET  /v1/settlements?date=YYYY-MM-DD   -> settlement lines of that Cairo day (payments, refunds)
// POST /v1/test-controls {nextMandateCharge, nextRefund: 'succeed'|'fail'}
// POST /v1/test-controls/redeliver {eventId} -> sends a stored event again (duplicate webhooks)
// POST /v1/test-webhook                  -> sends one signed sample webhook now
// GET  /api/webhooks · GET /health
//
// Webhook: POST ${FAKE_PAY_WEBHOOK_URL}, header `x-fake-pay-signature: sha256=<hex HMAC of body>`
// keyed with PAYMENT_WEBHOOK_SECRET. Each event has a unique `eventId` (dedupe on it).
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/** Sample provider fee on a settled line: 2% (a Link cost, OD-15). */
const feeOf = (amountPt) => Math.floor(amountPt * 0.02);
const cairoDay = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(d);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function createFakePay({
  port = 8091,
  publicUrl = `http://localhost:${port}`,
  webhookUrl = '',
  secret = '',
  log = console.log,
} = {}) {
  const checkouts = new Map();
  const references = new Map();
  const mandates = new Map();
  const charges = new Map();
  const refunds = new Map();
  const lines = []; // settlement lines {date, providerRef, kind, amountPt, feePt}
  const sent = [];
  const controls = { nextMandateCharge: 'succeed', nextRefund: 'succeed' };
  const sign = (body) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  async function post(body) {
    if (!webhookUrl) return { delivered: false, status: 'not_sent:no_FAKE_PAY_WEBHOOK_URL' };
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fake-pay-signature': sign(body) },
        body,
      });
      return { delivered: r.ok, status: r.status };
    } catch (e) {
      return { delivered: false, status: `error:${e.cause?.code ?? e.code ?? e.message}` };
    }
  }

  async function deliver(type, data) {
    const event = {
      eventId: `evt_${randomUUID()}`,
      type,
      occurredAt: new Date().toISOString(),
      ...data,
    };
    const body = JSON.stringify(event);
    const record = { eventId: event.eventId, type, at: event.occurredAt, status: null, body };
    sent.unshift(record);
    if (sent.length > 500) sent.pop();
    const out = await post(body);
    record.status = out.status;
    return { ...out, body, signature: sign(body), eventId: event.eventId };
  }
  const later = (fn) => setTimeout(() => void fn().catch(() => {}), 150);

  function capture(providerRef, amountPt) {
    lines.push({
      date: cairoDay(),
      providerRef,
      kind: 'payment',
      amountPt,
      feePt: feeOf(amountPt),
    });
  }

  const readJson = (req) =>
    new Promise((resolve) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch {
          resolve(Object.fromEntries(new URLSearchParams(raw)));
        }
      });
    });
  const send = (res, code, body, type = 'application/json', headers = {}) => {
    res.writeHead(code, { 'content-type': type, ...headers });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };

  const checkoutPage = (c) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>fake-pay checkout</title>
<style>body{font-family:system-ui,sans-serif;background:#F1F6FB;margin:0;display:grid;place-items:center;min-height:100vh}
main{background:#fff;border:1px solid #DCE5EC;border-radius:16px;padding:24px;max-width:360px;width:calc(100% - 32px)}
h1{font-size:18px;margin:0 0 4px}p{color:#526575;font-size:14px}button{width:100%;min-height:44px;border-radius:12px;font:600 14px system-ui;margin-top:8px;cursor:pointer}
.ok{background:#00ADF7;border:0;color:#0A1824}.ko{background:#fff;border:1px solid #DCE5EC;color:#BB3340}</style></head>
<body><main><h1>fake-pay hosted checkout</h1>
<p>Local test provider with sample money. No card details are collected anywhere: choose the outcome to simulate.</p>
<p>Order <bdi dir="ltr">${esc(c.orderRef)}</bdi> · ${esc(c.method)} · amount ${esc(c.amountPt)} piasters${c.saveCard ? ' · saves the card for monthly renewals' : ''}</p>
${
  c.status === 'open'
    ? `<form method="post" action="/checkout/${esc(c.id)}/complete"><input type="hidden" name="result" value="succeeded"><button class="ok" data-testid="fake-pay-succeed">Simulate success</button></form>
<form method="post" action="/checkout/${esc(c.id)}/complete"><input type="hidden" name="result" value="failed"><button class="ko" data-testid="fake-pay-fail">Simulate failure</button></form>`
    : `<p data-testid="fake-pay-closed">This checkout is ${esc(c.status)}.</p>`
}
</main></body></html>`;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    const isPost = req.method === 'POST';
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/api/webhooks')
      return send(res, 200, { items: sent.map(({ body, ...r }) => r) });

    // ── hosted checkout (card, wallet) ──────────────────────────────────────────
    if (isPost && url.pathname === '/v1/checkouts') {
      const { orderRef, amountPt, returnUrl, saveCard, method } = await readJson(req);
      if (!orderRef || !Number.isInteger(amountPt) || amountPt <= 0)
        return send(res, 400, { error: 'orderRef and a positive integer amountPt are required' });
      const c = {
        id: `chk_${randomUUID()}`,
        orderRef,
        amountPt,
        returnUrl: returnUrl ?? null,
        saveCard: !!saveCard,
        method: method === 'wallet' ? 'wallet' : 'card',
        status: 'open',
      };
      checkouts.set(c.id, c);
      return send(res, 201, { checkoutId: c.id, url: `${publicUrl}/checkout/${c.id}` });
    }
    if (parts[0] === 'checkout' && parts[1]) {
      const c = checkouts.get(parts[1]);
      if (!c) return send(res, 404, 'Unknown checkout', 'text/plain');
      if (req.method === 'GET' && parts.length === 2)
        return send(res, 200, checkoutPage(c), 'text/html; charset=utf-8');
      if (isPost && parts[2] === 'complete') {
        const { result } = await readJson(req);
        if (c.status === 'open') {
          c.status = result === 'failed' ? 'failed' : 'succeeded';
          const card = c.method === 'card' ? { brand: 'visa', last4: '4242' } : null;
          let mandate = null;
          if (c.status === 'succeeded') {
            capture(c.id, c.amountPt);
            if (c.saveCard && card) {
              mandate = { tokenRef: `tok_${randomUUID()}`, ...card, expMonth: 12, expYear: 2030 };
              mandates.set(mandate.tokenRef, { ...mandate, status: 'active' });
            }
          }
          await deliver(`payment.${c.status}`, {
            providerRef: c.id,
            orderRef: c.orderRef,
            amountPt: c.amountPt,
            method: c.method,
            card,
            mandate,
            reason: c.status === 'failed' ? 'card_declined' : null,
          });
        }
        // Never trust this redirect for status: only the webhook changes payment state (BR-MNY-12).
        return c.returnUrl
          ? send(res, 303, '', 'text/plain', { location: c.returnUrl })
          : send(res, 200, `Done: ${c.status}`, 'text/plain');
      }
    }
    if (isPost && parts[0] === 'v1' && parts[1] === 'checkouts' && parts[3] === 'expire') {
      const c = checkouts.get(parts[2]);
      if (!c) return send(res, 404, { error: 'not found' });
      if (c.status === 'open') {
        c.status = 'expired';
        later(() => deliver('payment.expired', { providerRef: c.id, orderRef: c.orderRef }));
      }
      return send(res, 200, { status: c.status });
    }

    // ── Fawry references ────────────────────────────────────────────────────────
    if (isPost && url.pathname === '/v1/fawry-references') {
      const { orderRef, amountPt, expiresAt } = await readJson(req);
      if (!orderRef || !Number.isInteger(amountPt) || amountPt <= 0 || !expiresAt)
        return send(res, 400, { error: 'orderRef, amountPt and expiresAt are required' });
      let reference;
      do reference = String(80000000 + Math.floor(Math.random() * 19999999));
      while (references.has(reference));
      references.set(reference, { reference, orderRef, amountPt, expiresAt, status: 'open' });
      return send(res, 201, { reference, expiresAt });
    }
    if (isPost && parts[0] === 'v1' && parts[1] === 'fawry-references' && parts[2]) {
      const f = references.get(parts[2]);
      if (!f) return send(res, 404, { error: 'not found' });
      if (parts[3] === 'pay') {
        if (f.status === 'paid') return send(res, 409, { error: 'already paid' });
        f.status = 'paid';
        capture(f.reference, f.amountPt);
        const out = await deliver('payment.succeeded', {
          providerRef: f.reference,
          orderRef: f.orderRef,
          amountPt: f.amountPt,
          method: 'fawry',
          card: null,
          mandate: null,
        });
        return send(res, 200, { status: 'paid', delivered: out.delivered });
      }
      if (parts[3] === 'expire') {
        if (f.status === 'open') {
          f.status = 'expired';
          later(() =>
            deliver('payment.expired', { providerRef: f.reference, orderRef: f.orderRef }),
          );
        }
        return send(res, 200, { status: f.status });
      }
    }

    // ── saved cards (monthly plan renewals) ──────────────────────────────────────
    if (isPost && parts[0] === 'v1' && parts[1] === 'mandates' && parts[2]) {
      // `tok_seed_…`: the saved sample cards of `pnpm seed:demo` (fake-pay keeps nothing on disk).
      if (!mandates.has(parts[2]) && parts[2].startsWith('tok_seed_'))
        mandates.set(parts[2], {
          tokenRef: parts[2],
          brand: 'visa',
          last4: '4242',
          status: 'active',
        });
      const m = mandates.get(parts[2]);
      if (!m) return send(res, 404, { error: 'unknown token' });
      if (parts[3] === 'revoke') {
        m.status = 'revoked';
        return send(res, 200, { ok: true });
      }
      if (parts[3] === 'charges') {
        const { orderRef, amountPt, idempotencyKey } = await readJson(req);
        const prior = idempotencyKey && charges.get(idempotencyKey);
        if (prior) return send(res, 200, { chargeRef: prior.id });
        const ok = m.status === 'active' && controls.nextMandateCharge !== 'fail';
        controls.nextMandateCharge = 'succeed';
        const ch = {
          id: `chg_${randomUUID()}`,
          orderRef,
          amountPt,
          status: ok ? 'succeeded' : 'failed',
        };
        charges.set(idempotencyKey ?? ch.id, ch);
        if (ok) capture(ch.id, amountPt);
        later(() =>
          deliver(`payment.${ch.status}`, {
            providerRef: ch.id,
            orderRef,
            amountPt,
            method: 'card',
            card: { brand: m.brand, last4: m.last4 },
            mandate: null,
            reason: ok ? null : 'insufficient_funds',
          }),
        );
        return send(res, 201, { chargeRef: ch.id });
      }
    }

    // ── refunds ──────────────────────────────────────────────────────────────────
    if (isPost && url.pathname === '/v1/refunds') {
      const { paymentRef, amountPt, idempotencyKey } = await readJson(req);
      if (!paymentRef || !Number.isInteger(amountPt) || amountPt <= 0)
        return send(res, 400, { error: 'paymentRef and amountPt are required' });
      const prior = idempotencyKey && refunds.get(idempotencyKey);
      if (prior) return send(res, 200, { refundRef: prior.id });
      const ok = controls.nextRefund !== 'fail';
      controls.nextRefund = 'succeed';
      const r = {
        id: `rfd_${randomUUID()}`,
        paymentRef,
        amountPt,
        status: ok ? 'succeeded' : 'failed',
      };
      refunds.set(idempotencyKey ?? r.id, r);
      if (ok)
        lines.push({ date: cairoDay(), providerRef: r.id, kind: 'refund', amountPt, feePt: 0 });
      later(() =>
        deliver(`refund.${r.status}`, {
          refundRef: r.id,
          providerRef: paymentRef,
          orderRef: idempotencyKey ?? r.id,
          amountPt,
        }),
      );
      return send(res, 201, { refundRef: r.id });
    }

    if (req.method === 'GET' && parts[0] === 'v1' && parts[1] === 'payments' && parts[2]) {
      const c = checkouts.get(parts[2]);
      const f = references.get(parts[2]);
      const ch = [...charges.values()].find((x) => x.id === parts[2]);
      const x = c ?? f ?? ch;
      if (!x) return send(res, 404, { error: 'not found' });
      const status = { open: 'pending', paid: 'succeeded' }[x.status] ?? x.status;
      return send(res, 200, { providerRef: parts[2], status, amountPt: x.amountPt });
    }
    if (req.method === 'GET' && url.pathname === '/v1/settlements') {
      const date = url.searchParams.get('date') ?? cairoDay();
      return send(res, 200, { date, lines: lines.filter((l) => l.date === date) });
    }

    // ── test controls (local only) ──────────────────────────────────────────────
    if (isPost && url.pathname === '/v1/test-controls') {
      const body = await readJson(req);
      for (const k of ['nextMandateCharge', 'nextRefund'])
        if (body[k] === 'fail' || body[k] === 'succeed') controls[k] = body[k];
      return send(res, 200, controls);
    }
    if (isPost && url.pathname === '/v1/test-controls/redeliver') {
      const { eventId } = await readJson(req);
      const record = sent.find((r) => r.eventId === eventId);
      if (!record) return send(res, 404, { error: 'unknown event' });
      return send(res, 200, await post(record.body));
    }
    if (isPost && url.pathname === '/v1/test-webhook') {
      const out = await deliver('payment.succeeded', {
        providerRef: 'chk_test',
        orderRef: 'test-order',
        amountPt: 55000,
        method: 'card',
        card: null,
        mandate: null,
      });
      return send(res, 200, out);
    }
    send(res, 404, { error: 'not found' });
  });

  return {
    server,
    controls,
    sent,
    listen: () =>
      new Promise((resolve) =>
        server.listen(port, () => {
          const p = server.address().port;
          resolve(p);
        }),
      ),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    setWebhookUrl: (u) => {
      webhookUrl = u;
    },
    setPublicUrl: (u) => {
      publicUrl = u;
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8091);
  const fake = createFakePay({
    port,
    publicUrl: process.env.FAKE_PAY_PUBLIC_URL ?? `http://localhost:${port}`,
    webhookUrl: process.env.FAKE_PAY_WEBHOOK_URL ?? '',
    secret: process.env.PAYMENT_WEBHOOK_SECRET ?? '',
  });
  await fake.listen();
  console.log(`fake-pay on :${port}`);
}
