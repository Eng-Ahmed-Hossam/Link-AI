/**
 * `pnpm mock:server` — the same MSW handlers the apps use in `mock` mode, served over HTTP with ONE
 * shared in-memory state, so the parent PWA, the owner web and the teacher app see the same data
 * (API mode `mock-server`). Dev only: refuses to start unless APP_ENV is unset or `local`.
 * No outside provider is ever called. The only file it writes is the presenter's flag switches
 * (`.data/demo-flags.json`, git-ignored) so the Phase 2 / marketplace / real-STT switches survive a
 * restart. With "real speech-to-text" on (and ai-service running on this machine, AI_SERVICE_URL +
 * AI_SERVICE_TOKEN), voice notes and Ask Link questions go to local Whisper as `synthetic` data.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getResponse } from 'msw';
import { handlers } from './handlers';
import { configureVoice, demoSnapshot, onDemoChange, setDemo, type DemoState } from './followup/db';
import { configureBridge } from './followup/voice-bridge';
import { sendVoiceJob, transcribeQuestion, type AiTarget } from './followup/ai-client';
import {
  DEMO_SECRET_HEADER,
  demoGate,
  demoGateFromEnv,
  isPublicDemoRoute,
  publicSettings,
} from './demo-gate';
import { DEFAULT_LIMITS, SANDBOX_PREFIX, Sandboxes, currentSandbox } from './sandbox';

// ── persisted demo flags ─────────────────────────────────────────────────────────
const FLAGS_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.data', 'demo-flags.json');
type Flags = Pick<DemoState, 'phase2' | 'marketplace' | 'realStt'>;
const PRESETS: Record<string, Flags> = {
  // The MVP pilot setup (CF-29): follow-up only.
  'phase2-only': { phase2: true, marketplace: false },
  'phase1-only': { phase2: false, marketplace: true },
  both: { phase2: true, marketplace: true },
};
if (existsSync(FLAGS_FILE)) {
  try {
    const saved = JSON.parse(readFileSync(FLAGS_FILE, 'utf8')) as Partial<Flags>;
    setDemo({
      phase2: !!saved.phase2,
      marketplace: saved.marketplace !== false,
      realStt: !!saved.realStt,
    });
  } catch {
    /* unreadable: fall back to the preset below */
  }
} else if (process.env.DEMO_DEFAULT_FLAGS && PRESETS[process.env.DEMO_DEFAULT_FLAGS]) {
  setDemo(PRESETS[process.env.DEMO_DEFAULT_FLAGS]!);
}
if (process.env.DEMO_REAL_STT === '1') setDemo({ realStt: true });
let lastSaved = '';
const persistFlags = (d: DemoState) => {
  applyRealStt(!!d.realStt);
  const json = JSON.stringify(
    { phase2: d.phase2, marketplace: d.marketplace, realStt: !!d.realStt },
    null,
    2,
  );
  if (json === lastSaved) return;
  lastSaved = json;
  mkdirSync(dirname(FLAGS_FILE), { recursive: true });
  writeFileSync(FLAGS_FILE, json + '\n');
};

const GATE = demoGateFromEnv();
/**
 * The public trial (ADR-0010): on a hosted server every visitor works in their own sandbox
 * (`/sb/<id>/…`); MOCK_SANDBOXES=1 turns it on locally (tests).
 */
const SANDBOX_MODE = GATE.hosted || process.env.MOCK_SANDBOXES === '1';
const num = (v: string | undefined) => (v ? Number(v) : undefined);
const SANDBOXES = new Sandboxes({
  ...DEFAULT_LIMITS,
  max: num(process.env.MOCK_SANDBOX_MAX) ?? DEFAULT_LIMITS.max,
  newPerIpHour: num(process.env.MOCK_SANDBOX_NEW_PER_IP_HOUR) ?? DEFAULT_LIMITS.newPerIpHour,
  requestsPerIpMinute:
    num(process.env.MOCK_SANDBOX_REQ_PER_IP_MIN) ?? DEFAULT_LIMITS.requestsPerIpMinute,
});
if (SANDBOX_MODE) setInterval(() => SANDBOXES.sweep(), 5 * 60_000).unref();

const PORT = Number(process.env.MOCK_SERVER_PORT ?? process.env.PORT ?? 4010);
const CALLBACK_BASE = (process.env.MOCK_SERVER_INTERNAL_URL ?? `http://127.0.0.1:${PORT}`).replace(
  /\/$/,
  '',
);

// ── real speech-to-text in the demo (B3) ─────────────────────────────────────────
const AI: AiTarget | null =
  process.env.AI_SERVICE_URL && process.env.AI_SERVICE_TOKEN
    ? {
        url: process.env.AI_SERVICE_URL,
        token: process.env.AI_SERVICE_TOKEN,
        dataClass: 'synthetic', // the presenter's role-played notes: never real student audio
        callbackBase: CALLBACK_BASE,
      }
    : null;
const audio = new Map<string, { bytes: Uint8Array; mime: string }>();
/** Uploaded audio per sandbox: two visitors' note ids may be equal. */
const audioKey = (id: string) => `${currentSandbox() ?? ''}:${id}`;
let realOn: boolean | null = null;
function applyRealStt(on: boolean) {
  const active = on && !!AI;
  if (active === realOn) return;
  realOn = active;
  if (on && !AI)
    console.warn('mock-server: real speech-to-text is on but ai-service is not set up.');
  configureBridge({
    audioStore: active
      ? { put: (id, bytes, mime) => void audio.set(audioKey(id), { bytes, mime }) }
      : null,
    internalToken: active ? AI!.token : null,
    assistantStt: active ? (bytes, mime) => transcribeQuestion(AI!, bytes, mime) : null,
  });
  configureVoice({
    dispatch: active
      ? (d) => {
          // The callback comes back into the same sandbox (/sb/<id>/…) on the public trial.
          const sb = currentSandbox();
          const target = sb ? { ...AI!, callbackBase: `${CALLBACK_BASE}/sb/${sb}` } : AI!;
          void sendVoiceJob(target, d, audio.get(audioKey(d.voiceId)) ?? null); // kept for "Try again"
        }
      : null,
  });
}
// Sandbox mode: each visitor's flags live in their own world; the server's file is never written.
onDemoChange((d) => {
  if (!SANDBOX_MODE) persistFlags(d);
});
if (!SANDBOX_MODE) persistFlags(demoSnapshot().demo);
const env = process.env.APP_ENV ?? 'local';
if (env !== 'local') {
  console.error(`mock-server: refusing to start with APP_ENV=${env} (local only).`);
  process.exit(1);
}

// Browsers on the dev machine only: the PWA (3000), Storybook (6006), Expo web (8081).
const ALLOWED = /^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?$/;
const ALLOWED_ORIGINS = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((x) => x.trim().replace(/\/$/, ''))
    .filter(Boolean),
);
const cors = (origin: string | undefined): Record<string, string> =>
  origin && (ALLOWED.test(origin) || ALLOWED_ORIGINS.has(origin.replace(/\/$/, '')))
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

if (GATE.hosted && !GATE.secret)
  console.log(
    'mock-server: hosted without DEMO_ROUTES_SECRET: /__demo/* is off except the sandboxed trial routes.',
  );
if (SANDBOX_MODE) console.log('mock-server: per-visitor sandboxes on (/sb/<id>/…).');

const problemOut = (
  res: ServerResponse,
  origin: string | undefined,
  status: number,
  code: string,
  detail: string,
) =>
  res
    .writeHead(status, { 'content-type': 'application/problem+json', ...cors(origin) })
    .end(JSON.stringify({ status, code, detail }));

/** The caller's address: Railway's edge sets X-Real-IP; else the socket. */
const ipOf = (req: IncomingMessage) =>
  (req.headers['x-real-ip'] as string | undefined)?.trim() || req.socket.remoteAddress || '?';

export const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors(origin)).end();
    return;
  }
  const started = Date.now();
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  // /sb/<id>/… names the visitor's sandbox (ADR-0010); the rest of the path is the route.
  const sb = SANDBOX_PREFIX.exec(url.pathname);
  const sandbox = sb?.[1] ?? null;
  if (sb) url.pathname = sb[2] ?? '/';
  // Health check for hosts (Railway): never a demo route, so it answers while /__demo is locked.
  if (url.pathname === '/health' && (req.method === 'GET' || req.method === 'HEAD')) {
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        status: 'ok',
        app: 'demo-api',
        commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? 'unknown',
        sandboxes: SANDBOX_MODE,
      }),
    );
    return;
  }
  if (SANDBOX_MODE && !sandbox) {
    problemOut(res, origin, 400, 'sandbox_required', 'Open the trial from the website (Try Link).');
    log(req.method!, url.pathname, 400, started);
    return;
  }
  // Demo routes: off on a hosted server unless the call sends DEMO_ROUTES_SECRET (demo-gate.ts);
  // a sandboxed visitor may call the few trial routes, always on its own world.
  let gate = demoGate(url.pathname, req.headers[DEMO_SECRET_HEADER] as string | undefined, GATE);
  const publicRoute =
    !!gate && SANDBOX_MODE && !!sandbox && isPublicDemoRoute(req.method!, url.pathname);
  if (publicRoute) gate = null;
  if (SANDBOX_MODE && sandbox) {
    const admit = SANDBOXES.admit(sandbox, ipOf(req));
    if (admit !== 'ok') {
      problemOut(res, origin, 429, admit, 'Too many requests from this address. Try again later.');
      log(req.method!, url.pathname, 429, started);
      return;
    }
  }
  if (gate) {
    const detail = gate === 401 ? 'Demo routes need the demo secret.' : 'Not found.';
    res.writeHead(gate, { 'content-type': 'application/problem+json', ...cors(origin) }).end(
      JSON.stringify({
        status: gate,
        code: gate === 401 ? 'demo_secret_required' : 'not_found',
        detail,
      }),
    );
    log(req.method!, url.pathname, gate, started);
    return;
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers))
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  let body = await bodyOf(req);
  // A visitor may switch only the trial's flags (no real speech-to-text, no faults).
  if (publicRoute && url.pathname === '/__demo/settings') {
    let parsed: unknown = {};
    try {
      parsed = body ? JSON.parse(body.toString('utf8')) : {};
    } catch {
      /* not JSON: nothing allowed */
    }
    body = Buffer.from(JSON.stringify(publicSettings(parsed)));
    headers.set('content-type', 'application/json');
  }
  const handle = async () => {
    try {
      const request = new Request(url, { method: req.method, headers, body });
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
      if (response.body && response.headers.get('content-type')?.includes('text/event-stream')) {
        // Stream server-sent events as they are produced (the assistant answer streams, V03).
        const reader = response.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(Buffer.from(value));
        }
        res.end();
      } else res.end(Buffer.from(await response.arrayBuffer()));
      log(req.method!, url.pathname, response.status, started);
    } catch (e) {
      console.error(e);
      res.writeHead(500, cors(origin)).end();
    }
  };
  if (SANDBOX_MODE && sandbox) await SANDBOXES.run(sandbox, handle);
  else await handle();
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
