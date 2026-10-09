// whatsapp-fake: the local WhatsApp provider behind the `WhatsAppSender` fake adapter (R3).
// SAMPLE MESSAGES ONLY: nothing leaves this container; no phone is ever contacted. It accepts
// approved messages from Link and reports their delivery ONLY when someone asks (Demo tools or a
// test), through signed webhooks — the way a real provider would (BR-APR-11).
//
// POST /v1/messages {to, body, idempotencyKey, ref}  -> {id, status: 'accepted'} (same key → same id)
// POST /v1/messages/:id/status {status: sent|delivered|read|failed, reason?} -> sends a status webhook
// POST /v1/inbound {from, body, inReplyTo?}          -> sends an inbound-reply webhook (STOP included)
// POST /v1/test-controls/redeliver {eventId}         -> sends a stored event again (duplicates)
// GET  /api/messages · GET /api/webhooks · GET / (HTML list) · GET /health
//
// Webhook: POST ${WHATSAPP_FAKE_WEBHOOK_URL}, header `x-whatsapp-fake-signature: sha256=<hex HMAC
// of the body>` keyed with WHATSAPP_WEBHOOK_SECRET. Each event has a unique `eventId`.
import { createServer } from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const ORDER = ['accepted', 'sent', 'delivered', 'read'];

export function createWhatsAppFake({ port = 8094, webhookUrl = '', secret = '' } = {}) {
  const messages = new Map(); // id → {id, to, body, ref, status, at, history}
  const byKey = new Map();
  const sent = []; // webhooks {eventId, body, status}
  const sign = (body) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

  async function post(body) {
    if (!webhookUrl) return { delivered: false, status: 'not_sent:no_WHATSAPP_FAKE_WEBHOOK_URL' };
    try {
      const r = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-whatsapp-fake-signature': sign(body) },
        body,
      });
      return { delivered: r.ok, status: r.status };
    } catch (e) {
      return { delivered: false, status: `error:${e.message}` };
    }
  }
  async function deliver(event) {
    const body = JSON.stringify({
      ...event,
      eventId: `wa_evt_${randomUUID()}`,
      at: new Date().toISOString(),
    });
    const out = await post(body);
    sent.push({ eventId: JSON.parse(body).eventId, body, ...out });
    return { eventId: JSON.parse(body).eventId, ...out };
  }

  const readJson = (req) =>
    new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        try {
          resolve(raw ? JSON.parse(raw) : {});
        } catch (e) {
          reject(e);
        }
      });
    });
  const send = (res, code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type });
    res.end(type === 'application/json' ? JSON.stringify(body) : body);
  };
  const page = () => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="5">
<title>whatsapp-fake · Link local</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#FAFDFF;color:#0A1824}
header{padding:16px 24px;border-bottom:1px solid #DCE5EC;background:#fff}h1{font-size:18px;margin:0}p{margin:4px 0 0;color:#526575;font-size:13px}
table{border-collapse:collapse;width:100%}th,td{padding:10px 24px;border-bottom:1px solid #DCE5EC;text-align:start;font-size:14px;vertical-align:top}
th{background:#F1F6FB;font-size:12px;color:#526575}td.body{white-space:pre-wrap}bdi{font-family:ui-monospace,monospace}</style></head><body>
<header><h1>whatsapp-fake</h1><p>Approved parent messages land here. Nothing is delivered; statuses move only when Demo tools ask. ${messages.size} captured.</p></header>
<table><thead><tr><th>Accepted</th><th>To</th><th>Status</th><th>Message</th></tr></thead><tbody>${[
    ...messages.values(),
  ]
    .reverse()
    .map(
      (m) =>
        `<tr><td>${esc(m.at)}</td><td><bdi dir="ltr">${esc(m.to)}</bdi></td><td>${esc(m.status)}</td><td class="body" dir="auto">${esc(m.body)}</td></tr>`,
    )
    .join('')}</tbody></table></body></html>`;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const isPost = req.method === 'POST';
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
      if (req.method === 'GET' && url.pathname === '/')
        return send(res, 200, page(), 'text/html; charset=utf-8');
      if (req.method === 'GET' && url.pathname === '/api/messages')
        return send(res, 200, { items: [...messages.values()] });
      if (req.method === 'GET' && url.pathname === '/api/webhooks')
        return send(res, 200, {
          items: sent.map(({ eventId, status, delivered }) => ({ eventId, status, delivered })),
        });
      if (isPost && url.pathname === '/v1/messages') {
        const { to, body, idempotencyKey, ref } = await readJson(req);
        if (!to || !body || !idempotencyKey)
          return send(res, 400, { error: 'to, body and idempotencyKey are required' });
        const known = byKey.get(idempotencyKey);
        if (known) return send(res, 200, { id: known, status: messages.get(known).status });
        const id = `wamid.${randomUUID()}`;
        messages.set(id, {
          id,
          to,
          body,
          ref: ref ?? null,
          status: 'accepted',
          at: new Date().toISOString(),
          history: [],
        });
        byKey.set(idempotencyKey, id);
        return send(res, 201, { id, status: 'accepted' });
      }
      const st = url.pathname.match(/^\/v1\/messages\/([^/]+)\/status$/);
      if (isPost && st) {
        const m = messages.get(decodeURIComponent(st[1]));
        if (!m) return send(res, 404, { error: 'unknown message' });
        const { status, reason } = await readJson(req);
        if (!['sent', 'delivered', 'read', 'failed'].includes(status))
          return send(res, 400, { error: 'status is sent | delivered | read | failed' });
        if (status !== 'failed' && ORDER.indexOf(status) <= ORDER.indexOf(m.status))
          return send(res, 409, { error: `already ${m.status}` });
        m.status = status;
        m.history.push({ status, at: new Date().toISOString() });
        const out = await deliver({
          type: 'status',
          messageId: m.id,
          status,
          ...(reason ? { reason } : {}),
        });
        return send(res, 200, { id: m.id, status, webhook: out });
      }
      if (isPost && url.pathname === '/v1/inbound') {
        const { from, body, inReplyTo } = await readJson(req);
        if (!from || !body) return send(res, 400, { error: 'from and body are required' });
        const out = await deliver({
          type: 'inbound',
          messageId: `wamid.in.${randomUUID()}`,
          from,
          body,
          ...(inReplyTo ? { inReplyTo } : {}),
        });
        return send(res, 200, out);
      }
      if (isPost && url.pathname === '/v1/test-controls/redeliver') {
        const { eventId } = await readJson(req);
        const record = sent.find((r) => r.eventId === eventId);
        if (!record) return send(res, 404, { error: 'unknown event' });
        return send(res, 200, await post(record.body));
      }
      send(res, 404, { error: 'not found' });
    } catch (e) {
      send(res, 500, { error: e.message });
    }
  });

  return {
    server,
    messages,
    sent,
    listen: () =>
      new Promise((resolve) => server.listen(port, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
    setWebhookUrl: (u) => {
      webhookUrl = u;
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.PORT ?? 8094);
  const fake = createWhatsAppFake({
    port,
    webhookUrl: process.env.WHATSAPP_FAKE_WEBHOOK_URL ?? '',
    secret: process.env.WHATSAPP_WEBHOOK_SECRET ?? '',
  });
  await fake.listen();
  console.log(`whatsapp-fake on :${port}`);
}
