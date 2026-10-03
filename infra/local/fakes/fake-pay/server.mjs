// fake-pay: the local payment provider behind the `PaymentProvider` fake adapter (docs/14 §2).
// Batch scope (walking skeleton): a hosted-checkout page and one signed test webhook.
// Fawry references, refunds, payouts and settlement reports arrive with E8-03.
//
// POST /v1/checkouts {orderRef, amountPt, returnUrl}  -> {checkoutId, url}
// GET  /checkout/:id                                  -> hosted page (NO card fields: the
//                                                        provider page simulates the result)
// POST /checkout/:id/complete {result: succeeded|failed} -> sends the signed webhook, redirects
// POST /v1/test-webhook                               -> sends one signed sample webhook now
// GET  /health
//
// Webhook: POST ${FAKE_PAY_WEBHOOK_URL}, header `x-fake-pay-signature: sha256=<hex HMAC of body>`
// keyed with PAYMENT_WEBHOOK_SECRET. Each event has a unique `eventId` (dedupe on it).
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8091);
const PUBLIC_URL = process.env.FAKE_PAY_PUBLIC_URL ?? `http://localhost:${PORT}`;
const WEBHOOK_URL = process.env.FAKE_PAY_WEBHOOK_URL ?? '';
const SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? '';
const checkouts = new Map();
const sent = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const sign = (body) => `sha256=${createHmac('sha256', SECRET).update(body).digest('hex')}`;

async function deliver(event) {
  const body = JSON.stringify(event);
  const record = {
    eventId: event.eventId,
    type: event.type,
    at: new Date().toISOString(),
    status: null,
  };
  sent.unshift(record);
  if (!WEBHOOK_URL) {
    record.status = 'not_sent:no_FAKE_PAY_WEBHOOK_URL';
    return { body, signature: sign(body), delivered: false };
  }
  try {
    const r = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-fake-pay-signature': sign(body) },
      body,
    });
    record.status = r.status;
    return { body, signature: sign(body), delivered: r.ok, status: r.status };
  } catch (e) {
    record.status = `error:${e.code ?? e.message}`;
    return { body, signature: sign(body), delivered: false };
  }
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
<p>Local test provider. No card details are collected anywhere — choose the outcome to simulate.</p>
<p>Order <bdi dir="ltr">${esc(c.orderRef)}</bdi> · amount ${esc(c.amountPt)} piasters</p>
<form method="post" action="/checkout/${esc(c.id)}/complete"><input type="hidden" name="result" value="succeeded"><button class="ok">Simulate success</button></form>
<form method="post" action="/checkout/${esc(c.id)}/complete"><input type="hidden" name="result" value="failed"><button class="ko">Simulate failure</button></form>
</main></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);
  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
  if (req.method === 'GET' && url.pathname === '/api/webhooks')
    return send(res, 200, { items: sent });

  if (req.method === 'POST' && url.pathname === '/v1/checkouts') {
    const { orderRef, amountPt, returnUrl } = await readJson(req);
    if (!orderRef || !Number.isInteger(amountPt) || amountPt <= 0)
      return send(res, 400, { error: 'orderRef and a positive integer amountPt are required' });
    const c = {
      id: `chk_${randomUUID()}`,
      orderRef,
      amountPt,
      returnUrl: returnUrl ?? null,
      status: 'open',
    };
    checkouts.set(c.id, c);
    return send(res, 201, { checkoutId: c.id, url: `${PUBLIC_URL}/checkout/${c.id}` });
  }

  if (parts[0] === 'checkout' && parts[1]) {
    const c = checkouts.get(parts[1]);
    if (!c) return send(res, 404, 'Unknown checkout', 'text/plain');
    if (req.method === 'GET' && parts.length === 2)
      return send(res, 200, checkoutPage(c), 'text/html; charset=utf-8');
    if (req.method === 'POST' && parts[2] === 'complete') {
      const { result } = await readJson(req);
      c.status = result === 'failed' ? 'failed' : 'succeeded';
      await deliver({
        eventId: `evt_${randomUUID()}`,
        type: `payment.${c.status}`,
        checkoutId: c.id,
        orderRef: c.orderRef,
        amountPt: c.amountPt,
        occurredAt: new Date().toISOString(),
      });
      // Never trust this redirect for status: only the webhook changes payment state (BR-MNY).
      return c.returnUrl
        ? send(res, 303, '', 'text/plain', { location: c.returnUrl })
        : send(res, 200, `Done: ${c.status}`, 'text/plain');
    }
  }

  if (req.method === 'POST' && url.pathname === '/v1/test-webhook') {
    const out = await deliver({
      eventId: `evt_${randomUUID()}`,
      type: 'payment.succeeded',
      checkoutId: 'chk_test',
      orderRef: 'test-order',
      amountPt: 55000,
      occurredAt: new Date().toISOString(),
    });
    return send(res, 200, out);
  }
  send(res, 404, { error: 'not found' });
}).listen(PORT, () => console.log(`fake-pay on :${PORT}`));
