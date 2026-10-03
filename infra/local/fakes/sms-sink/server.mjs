// sms-sink: the local SMS provider behind the `SmsSender` fake adapter (docs/14 §2).
// POST /messages {to, body, templateCode?}  -> captured in memory
// GET  /                                    -> HTML list of captured messages (newest first)
// GET  /api/messages                        -> JSON
// DELETE /api/messages                      -> clear
// GET  /health
// Nothing leaves this container. Local only.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT ?? 8090);
const MAX = 500;
const messages = [];

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

const page = () => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5"><title>sms-sink · Link local</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;background:#FAFDFF;color:#0A1824}
header{padding:16px 24px;border-bottom:1px solid #DCE5EC;background:#fff}
h1{font-size:18px;margin:0}p{margin:4px 0 0;color:#526575;font-size:13px}
table{border-collapse:collapse;width:100%}th,td{padding:10px 24px;border-bottom:1px solid #DCE5EC;text-align:start;font-size:14px;vertical-align:top}
th{background:#F1F6FB;font-size:12px;color:#526575}td.body{white-space:pre-wrap}bdi{font-family:ui-monospace,monospace}
.empty{padding:40px 24px;color:#526575}
</style></head><body>
<header><h1>sms-sink</h1><p>Every SMS the local stack sends lands here. Nothing is delivered. Refreshes every 5 s. ${messages.length} captured.</p></header>
${
  messages.length
    ? `<table><thead><tr><th>Received</th><th>To</th><th>Template</th><th>Message</th></tr></thead><tbody>${messages
        .map(
          (m) =>
            `<tr><td>${esc(m.receivedAt)}</td><td><bdi dir="ltr">${esc(m.to)}</bdi></td><td>${esc(m.templateCode)}</td><td class="body" dir="auto">${esc(m.body)}</td></tr>`,
        )
        .join('')}</tbody></table>`
    : '<div class="empty">No messages yet.</div>'
}
</body></html>`;

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

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'GET' && url.pathname === '/')
      return send(res, 200, page(), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/messages')
      return send(res, 200, { items: messages });
    if (req.method === 'DELETE' && url.pathname === '/api/messages') {
      messages.length = 0;
      return send(res, 204, '');
    }
    if (req.method === 'POST' && url.pathname === '/messages') {
      const { to, body, templateCode } = await readJson(req);
      if (!to || !body) return send(res, 400, { error: 'to and body are required' });
      const m = {
        id: crypto.randomUUID(),
        to,
        body,
        templateCode: templateCode ?? null,
        receivedAt: new Date().toISOString(),
      };
      messages.unshift(m);
      messages.length = Math.min(messages.length, MAX);
      return send(res, 202, { id: m.id, status: 'accepted' });
    }
    send(res, 404, { error: 'not found' });
  } catch {
    send(res, 400, { error: 'bad request' });
  }
}).listen(PORT, () => console.log(`sms-sink on :${PORT}`));
