/**
 * `pnpm mock:server` — the same MSW handlers the apps use in `mock` mode, served over HTTP with ONE
 * shared in-memory state, so the parent PWA, the owner web and the teacher app see the same data
 * (API mode `mock-server`). Dev only: refuses to start unless APP_ENV is unset or `local`.
 * No real provider is ever called; nothing is written to disk.
 */
import { createServer, type IncomingMessage } from 'node:http';
import { getResponse } from 'msw';
import { handlers } from './handlers';
import { demoSnapshot } from './followup/db';

const PORT = Number(process.env.MOCK_SERVER_PORT ?? 4010);
const env = process.env.APP_ENV ?? 'local';
if (env !== 'local') {
  console.error(`mock-server: refusing to start with APP_ENV=${env} (local only).`);
  process.exit(1);
}

// Browsers on the dev machine only: the PWA (3000), Storybook (6006), Expo web (8081).
const ALLOWED = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?$/;
const cors = (origin: string | undefined): Record<string, string> =>
  origin && ALLOWED.test(origin)
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'access-control-allow-headers':
          'authorization,content-type,idempotency-key,accept-language',
        'access-control-expose-headers': 'idempotent-replayed',
        'access-control-max-age': '600',
        vary: 'origin',
      }
    : {};

async function bodyOf(req: IncomingMessage) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined;
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(origin)).end();
    return;
  }
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers))
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  try {
    const request = new Request(url, { method: req.method, headers, body: await bodyOf(req) });
    const response = await getResponse(handlers, request);
    if (!response) {
      res.writeHead(404, { 'content-type': 'application/problem+json', ...cors(origin) }).end(
        JSON.stringify({
          status: 404,
          code: 'not_found',
          detail: `No mock for ${req.method} ${url.pathname}`,
        }),
      );
      log(req.method!, url.pathname, 404, started);
      return;
    }
    if (response.type === 'error') {
      // HttpResponse.error(): behave like a dropped connection (offline switch, T08 after-commit).
      log(req.method!, url.pathname, 'dropped', started);
      req.socket.destroy();
      return;
    }
    const out: Record<string, string> = { ...cors(origin) };
    response.headers.forEach((v, k) => (out[k] = v));
    res.writeHead(response.status, out);
    res.end(Buffer.from(await response.arrayBuffer()));
    log(req.method!, url.pathname, response.status, started);
  } catch (e) {
    console.error(e);
    res.writeHead(500, cors(origin)).end();
  }
});

function log(method: string, path: string, status: number | string, started: number) {
  if (path.startsWith('/__demo/state')) return; // polled by the demo panels
  console.log(`${method.padEnd(6)} ${path} → ${status} (${Date.now() - started} ms)`);
}

server.listen(PORT, () => {
  const s = demoSnapshot();
  console.log(`mock-server: http://localhost:${PORT}  (scenario demo-followup, APP_ENV=local)`);
  console.log(
    `  ${s.records.confirmed} confirmed records · ${s.signals.length} flag(s) · ${s.cases.length} case(s) · Phase 2 flag ${s.demo.phase2 ? 'on' : 'off'}`,
  );
  console.log(
    '  Sign in with code 123456: parent +20 10 0000 0001 · teacher …0002 · owner …0003 · reception …0004',
  );
});
