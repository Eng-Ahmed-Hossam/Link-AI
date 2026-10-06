/**
 * The pilot server's request handling, without the listeners (so tests can drive it directly).
 *
 * - `/v1/pilot/*` and `/v1/me`: sign-in with a PIN, sessions, people (A3, A16).
 * - every other `/v1/*` call: the follow-up handlers in `pilotHandlers` (no demo or mock route).
 * - the teacher port serves the teacher app's static pilot build; the web port proxies the owner
 *   web's production server and only its centre pages.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { getResponse } from 'msw';
import * as fu from '@link/mocks/followup';
import { setUserResolver } from '@link/mocks/http';
import { configureBridge } from '@link/mocks/voice-bridge';
import { sendVoiceJob } from '@link/mocks/ai-client';
import { AudioVault, purgeAudio } from './audio';
import { pilotHandlers } from '@link/mocks/pilot';
import type { StaffRole } from '@link/mocks/world';
import { COOKIE, PilotAuth, clearCookie, cookieValue, sessionCookie } from './auth';
import type { PilotConfig } from './config';
import type { PilotStore } from './store';

export const PILOT_CENTRE_ID = 'cen-pilot';
const ROLE: Record<StaffRole, 'centre_owner' | 'centre_staff' | 'teacher'> = {
  owner: 'centre_owner',
  reception: 'centre_staff',
  teacher: 'teacher',
};
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'microphone=(self), camera=(), geolocation=()',
};

export interface PilotApp {
  auth: PilotAuth;
  /** Delete recordings past their date (30 days, or the pilot's end); run hourly and at start. */
  runRetention(now?: Date): string[];
  handle(req: IncomingMessage, res: ServerResponse, surface: 'web' | 'teacher'): Promise<void>;
  /** Fetch-style entry for the `/v1` API (tests). */
  api(req: Request, ip?: string): Promise<Response>;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });
const problem = (status: number, code: string, detail: string, extra: object = {}) =>
  new Response(
    JSON.stringify({ type: 'about:blank', title: detail, status, code, detail, ...extra }),
    {
      status,
      headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    },
  );

export function createPilotApp(cfg: PilotConfig, store: PilotStore): PilotApp {
  const activeUser = (id: string) => fu.world().users.some((u) => u.id === id && u.active);
  const userOf = (id: string) => fu.world().users.find((u) => u.id === id && u.active);
  const auth = new PilotAuth(store, { sessionHours: cfg.sessionHours, isActiveUser: activeUser });
  // Mock `mock.<userId>` tokens are never accepted in the pilot: only server-side sessions.
  setUserResolver((req) => auth.userFor(cookieValue(req.headers.get('cookie'))));

  // ── voice notes (Part B): local ai-service, consented_real only, audio encrypted here ──────────
  const voice = (store.snap!.voice ??= { consent: {}, audio: {} });
  voice.enabled ??= {};
  voice.paused ??= null;
  const vault = new AudioVault(cfg.dataDir);
  const voiceAvailable = () => cfg.voice && !!cfg.aiToken;
  // 4.2: voice is off by default. A teacher gets it only when the laptop has it (PILOT_VOICE),
  // the owner has not switched it off for everyone, the teacher's consent is recorded, and the
  // owner switched it on for that teacher.
  const voiceOn = (userId: string) =>
    voiceAvailable() &&
    !voice.paused?.on &&
    !!voice.consent[userId]?.granted &&
    !!voice.enabled?.[userId]?.on;
  const ai = cfg.aiToken
    ? {
        url: cfg.aiUrl,
        token: cfg.aiToken,
        dataClass: 'consented_real' as const,
        callbackBase: `http://127.0.0.1:${cfg.webPort}`,
      }
    : null;
  fu.configureVoice({
    dispatch: ai
      ? (d) => {
          const e = voice.audio[d.voiceId];
          const bytes = e && !e.deletedAt ? vault.get(d.voiceId, e.file) : null;
          void sendVoiceJob(ai, d, bytes ? { bytes, mime: e!.mime } : null);
        }
      : null,
    policy: voiceOn,
    uploadPath: (id) => `/v1/voice-notes/${id}/audio`,
  });
  configureBridge({ internalToken: cfg.aiToken, audioStore: null, assistantStt: null });

  // The active speech profile (GPU, CPU with rules only, CPU with an LLM) and its time estimate,
  // from ai-service (/ready). Cached for a minute; null when ai-service does not answer.
  let profileCache: { at: number; value: unknown } | null = null;
  async function voiceProfile(): Promise<unknown> {
    if (profileCache && Date.now() - profileCache.at < 60_000) return profileCache.value;
    let value: unknown = null;
    try {
      const r = await fetch(`${cfg.aiUrl}/ready`, { signal: AbortSignal.timeout(2000) });
      if (r.ok) value = ((await r.json()) as { profile?: unknown }).profile ?? null;
    } catch {
      value = null;
    }
    profileCache = { at: Date.now(), value };
    return value;
  }

  function runRetention(now = new Date()) {
    const gone = purgeAudio(voice.audio, vault, store.snap!.meta.endDate, now);
    if (gone.length) {
      store.write();
      fu.recordSystemEvent(
        'voice.audio_deleted',
        { en: 'Voice recordings deleted (retention)', ar: 'حُذفت تسجيلات صوتية (مدة الحفظ)' },
        { count: gone.length },
      );
    }
    return gone;
  }

  const originOk = (origin: string | null) => !origin || cfg.allowedOrigins.includes(origin);

  async function pilotRoute(req: Request, ip: string): Promise<Response | null> {
    const url = new URL(req.url);
    const p = url.pathname;
    const secure = url.protocol === 'https:';
    const me = auth.userFor(cookieValue(req.headers.get('cookie')));
    const lang = req.headers.get('accept-language')?.startsWith('en') ? 'en' : 'ar';
    const body = async () => (await req.json().catch(() => ({}))) as Record<string, unknown>;

    if (p === '/v1/pilot/info' && req.method === 'GET') {
      const m = store.snap!.meta;
      return json(200, {
        mode: 'pilot',
        centreName: m.centreName,
        startDate: m.startDate,
        endDate: m.endDate,
      });
    }
    // The sign-in picker: first names / nicknames and roles of the people who can sign in.
    if (p === '/v1/pilot/people' && req.method === 'GET')
      return json(
        200,
        fu
          .world()
          .users.filter((u) => u.active && store.snap!.auth.pins[u.id])
          .map((u) => ({ id: u.id, displayName: u.name[lang], role: u.role })),
      );
    if (p === '/v1/pilot/sessions' && req.method === 'POST') {
      const b = await body();
      const r = auth.signIn(String(b.userId ?? ''), String(b.pin ?? ''), ip);
      if (!r.ok) {
        if (r.code === 'locked') {
          fu.recordAccessEvent('access.locked', String(b.userId ?? ''), {});
          return problem(423, 'locked', 'Too many wrong PINs. Try again later.', {
            lockedUntil: r.lockedUntil,
          });
        }
        if (r.code === 'rate_limited')
          return problem(
            429,
            'rate_limited',
            'Too many attempts from this device. Wait 15 minutes.',
          );
        if (r.code === 'wrong_pin')
          return problem(401, 'wrong_pin', 'Wrong PIN.', { attemptsLeft: r.attemptsLeft });
        return problem(401, 'cannot_sign_in', 'This person cannot sign in.');
      }
      const u = userOf(r.userId)!;
      fu.recordAccessEvent('access.signed_in', r.userId, { role: u.role });
      return json(
        200,
        { id: u.id, name: u.name[lang], role: u.role, expiresAt: r.expiresAt },
        { 'set-cookie': sessionCookie(r.token, cfg.sessionHours * 3600, secure) },
      );
    }
    if (p === '/v1/pilot/sessions/current' && req.method === 'DELETE') {
      if (me) fu.recordAccessEvent('access.signed_out', me, {});
      auth.signOut(cookieValue(req.headers.get('cookie')));
      return new Response(null, { status: 204, headers: { 'set-cookie': clearCookie(secure) } });
    }
    if (p === '/v1/me' && req.method === 'GET') {
      const u = me ? userOf(me) : null;
      if (!u) return problem(401, 'unauthenticated', 'Sign in to continue.');
      return json(200, {
        id: u.id,
        name: u.name[lang],
        language: lang,
        roles: [ROLE[u.role]],
        centreId: PILOT_CENTRE_ID,
        voiceNotes: voiceOn(u.id),
      });
    }
    // ── voice upload: the recording, encrypted on this laptop (never leaves it) ───────────────
    const upload = /^\/v1\/voice-notes\/([^/]+)\/audio$/.exec(p);
    if (upload && req.method === 'PUT') {
      if (!me) return problem(401, 'unauthenticated', 'Sign in to continue.');
      try {
        fu.assertVoiceUpload(me, upload[1]!);
      } catch (e) {
        if (e instanceof fu.MockProblem) return problem(e.status, e.code, e.detail, e.extra);
        throw e;
      }
      if (!voiceOn(me)) return problem(503, 'stt_unavailable', 'Voice notes are not available.');
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length || bytes.length > 15_000_000)
        return problem(413, 'bad_audio', 'The recording is empty or too large.');
      const file = vault.put(upload[1]!, bytes);
      voice.audio[upload[1]!] = {
        file,
        mime: req.headers.get('content-type') ?? 'application/octet-stream',
        bytes: bytes.length,
        uploadedAt: new Date().toISOString(),
        teacherId: me,
        deletedAt: null,
      };
      store.write();
      return new Response(null, { status: 200 });
    }
    // ── the owner records a teacher's signed voice consent (E15-01), or its withdrawal ────────
    const consent = /^\/v1\/pilot\/users\/([^/]+)\/voice-consent$/.exec(p);
    if (consent && req.method === 'POST') {
      if (!me) return problem(401, 'unauthenticated', 'Sign in to continue.');
      if (userOf(me)?.role !== 'owner')
        return problem(403, 'forbidden', 'Only the owner records consent.');
      const target = userOf(consent[1]!);
      if (!target || target.role !== 'teacher')
        return problem(404, 'not_found', 'Teacher not found.');
      const granted = (await body()).granted === true;
      voice.consent[target.id] = { granted, at: new Date().toISOString(), by: me };
      if (!granted) {
        voice.enabled![target.id] = { on: false, at: new Date().toISOString(), by: me };
        // Withdrawn: the teacher's recordings and their text are deleted (teacher consent §6).
        for (const [, e] of Object.entries(voice.audio))
          if (e.teacherId === target.id && !e.deletedAt) {
            vault.delete(e.file);
            e.deletedAt = new Date().toISOString();
          }
        fu.forgetVoiceOf(target.id);
      }
      store.write();
      fu.recordSystemEvent(
        granted ? 'consent.voice_granted' : 'consent.voice_withdrawn',
        granted
          ? {
              en: 'Voice consent recorded for a teacher',
              ar: 'سُجّلت موافقة معلّم على الملاحظات الصوتية',
            }
          : {
              en: 'Voice consent withdrawn; recordings deleted',
              ar: 'سُحبت الموافقة وحُذفت التسجيلات',
            },
        { userId: target.id, by: me },
      );
      return json(200, { userId: target.id, voiceConsent: granted });
    }
    // ── 4.2: the owner switches voice on or off for one teacher (only after consent) ─────────
    const perTeacher = /^\/v1\/pilot\/users\/([^/]+)\/voice$/.exec(p);
    if (perTeacher && req.method === 'POST') {
      if (!me) return problem(401, 'unauthenticated', 'Sign in to continue.');
      if (userOf(me)?.role !== 'owner')
        return problem(403, 'forbidden', 'Only the owner switches voice notes on or off.');
      const target = userOf(perTeacher[1]!);
      if (!target || target.role !== 'teacher')
        return problem(404, 'not_found', 'Teacher not found.');
      const on = (await body()).on === true;
      if (on && !voice.consent[target.id]?.granted)
        return problem(409, 'consent_required', "Record the teacher's signed consent first.");
      voice.enabled![target.id] = { on, at: new Date().toISOString(), by: me };
      store.write();
      fu.recordSystemEvent(
        on ? 'voice.enabled' : 'voice.disabled',
        on
          ? { en: 'Voice notes switched on for a teacher', ar: 'شُغّلت الملاحظات الصوتية لمعلّم' }
          : { en: 'Voice notes switched off for a teacher', ar: 'أُوقفت الملاحظات الصوتية لمعلّم' },
        { userId: target.id, by: me },
      );
      return json(200, { userId: target.id, voiceOn: voiceOn(target.id) });
    }
    // ── 4.2: voice for the whole centre — status, profile estimate and the kill switch ───────
    if (p === '/v1/pilot/voice') {
      if (!me) return problem(401, 'unauthenticated', 'Sign in to continue.');
      const role = userOf(me)?.role;
      if (req.method === 'GET') {
        if (role !== 'owner' && role !== 'reception')
          return problem(403, 'forbidden', 'Centre staff only.');
        return json(200, {
          available: voiceAvailable(),
          paused: !!voice.paused?.on,
          pausedAt: voice.paused?.on ? voice.paused.at : null,
          profile: voiceAvailable() ? await voiceProfile() : null,
        });
      }
      if (req.method === 'POST') {
        if (role !== 'owner')
          return problem(403, 'forbidden', 'Only the owner switches voice notes off.');
        const paused = (await body()).paused === true;
        const at = new Date().toISOString();
        voice.paused = { on: paused, at, by: me };
        let stopped = 0;
        if (paused) {
          // Notes handed over but not processed yet are never processed, and their audio is
          // deleted now (earlier than the consent's 30 days, never later). Processed notes keep
          // the normal retention.
          for (const id of fu.pauseQueuedVoice()) {
            const e = voice.audio[id];
            if (e && !e.deletedAt) {
              vault.delete(e.file);
              e.deletedAt = at;
            }
            stopped++;
          }
        }
        store.write();
        fu.recordSystemEvent(
          paused ? 'voice.paused' : 'voice.resumed',
          paused
            ? {
                en: 'Voice notes switched off for everyone; waiting notes deleted',
                ar: 'أُوقفت الملاحظات الصوتية للجميع؛ حُذفت الملاحظات المنتظرة',
              }
            : { en: 'Voice notes switched back on', ar: 'أُعيد تشغيل الملاحظات الصوتية' },
          { by: me, stopped },
        );
        return json(200, { paused, stopped });
      }
    }
    // ── people (A16 in the pilot: staff see the list, only the owner changes it) ────
    const users = /^\/v1\/pilot\/users(?:\/([^/]+))?(\/pin)?$/.exec(p);
    if (users) {
      if (!me) return problem(401, 'unauthenticated', 'Sign in to continue.');
      try {
        if (!users[1] && req.method === 'GET') {
          const role = userOf(me)?.role;
          if (role !== 'owner' && role !== 'reception')
            return problem(403, 'forbidden', 'Centre staff only.');
          const w = fu.world();
          return json(
            200,
            w.users.map((u) => ({
              id: u.id,
              displayName: u.name[lang],
              role: u.role,
              active: u.active,
              hasPin: !!store.snap!.auth.pins[u.id],
              voiceConsent: !!voice.consent[u.id]?.granted,
              voiceConsentAt: voice.consent[u.id]?.granted ? voice.consent[u.id]!.at : null,
              voiceOn: !!voice.enabled?.[u.id]?.on && !!voice.consent[u.id]?.granted,
              groups: w.groups
                .filter((g) => g.teacherUserId === u.id)
                .map((g) => ({ id: g.id, name: g.name[lang] })),
            })),
          );
        }
        if (!users[1] && req.method === 'POST') {
          const b = await body();
          const u = fu.addPilotUser(me, {
            name: String(b.name ?? ''),
            role: b.role as StaffRole,
            groupIds: Array.isArray(b.groupIds) ? (b.groupIds as string[]) : [],
          });
          const pin = auth.setPin(u.id);
          return json(201, { user: { id: u.id, displayName: u.name[lang], role: u.role }, pin });
        }
        if (users[1] && users[2] && req.method === 'POST') {
          if (userOf(me)?.role !== 'owner')
            return problem(403, 'forbidden', 'Only the owner manages staff.');
          if (!userOf(users[1])) return problem(404, 'not_found', 'Person not found.');
          const pin = auth.setPin(users[1]);
          fu.recordAccessEvent('access.pin_reset', me, { userId: users[1] });
          return json(200, { pin });
        }
        if (users[1] && !users[2] && req.method === 'DELETE') {
          fu.removePilotUser(me, users[1]);
          auth.revokeSessions(users[1]);
          store.write();
          return new Response(null, { status: 204 });
        }
      } catch (e) {
        if (e instanceof fu.MockProblem) return problem(e.status, e.code, e.detail, e.extra);
        throw e;
      }
      return problem(405, 'method_not_allowed', 'Not allowed.');
    }
    return null;
  }

  async function api(req: Request, ip = 'local'): Promise<Response> {
    const origin = req.headers.get('origin');
    if (!originOk(origin))
      return problem(403, 'origin_not_allowed', 'This address is not allowed.');
    const own = await pilotRoute(req, ip);
    if (own) return own;
    const res = await getResponse(pilotHandlers, req);
    return res ?? problem(404, 'not_found', 'Not found.');
  }

  async function handle(req: IncomingMessage, res: ServerResponse, surface: 'web' | 'teacher') {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const secure = (req.socket as { encrypted?: boolean }).encrypted === true;
    if (secure) res.setHeader('strict-transport-security', 'max-age=86400');
    const host = req.headers.host ?? `${cfg.bind}`;
    const url = new URL(req.url ?? '/', `${secure ? 'https' : 'http'}://${host}`);
    const origin = req.headers.origin;

    if (url.pathname.startsWith('/v1/internal/')) {
      // ai-service's callbacks: this machine only (plus the shared token checked by the handler).
      const ip = req.socket.remoteAddress ?? '';
      if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip))
        return void res.writeHead(404).end();
    }
    if (url.pathname.startsWith('/v1/')) {
      if (req.method === 'OPTIONS') {
        // Same-origin apps need no preflight; only listed origins get one.
        if (!origin || !cfg.allowedOrigins.includes(origin)) return void res.writeHead(403).end();
        return void res
          .writeHead(204, {
            'access-control-allow-origin': origin,
            'access-control-allow-credentials': 'true',
            'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE',
            'access-control-allow-headers': 'content-type,idempotency-key,accept-language',
            vary: 'origin',
          })
          .end();
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers))
        if (typeof v === 'string') headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(', '));
      const chunks: Buffer[] = [];
      if (req.method !== 'GET' && req.method !== 'HEAD')
        for await (const c of req) chunks.push(c as Buffer);
      if (chunks.reduce((n, c) => n + c.length, 0) > 2_000_000)
        return void res.writeHead(413).end();
      const request = new Request(url, {
        method: req.method,
        headers,
        body: chunks.length ? Buffer.concat(chunks) : undefined,
      });
      const r = await api(request, req.socket.remoteAddress ?? 'unknown');
      const out: Record<string, string | string[]> = {};
      r.headers.forEach((v, k) => {
        if (k === 'set-cookie') out[k] = [...(r.headers.getSetCookie?.() ?? [v])];
        else out[k] = v;
      });
      if (origin && cfg.allowedOrigins.includes(origin)) {
        out['access-control-allow-origin'] = origin;
        out['access-control-allow-credentials'] = 'true';
        out.vary = 'origin';
      }
      res.writeHead(r.status, out);
      if (r.body) {
        const reader = r.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      }
      return void res.end();
    }

    if (surface === 'teacher') return serveStatic(cfg.teacherDist, url.pathname, res);
    return proxyWeb(req, res, url);
  }

  /** Owner web: only the centre pages and Next's own assets; everything else is not part of the pilot. */
  function proxyWeb(req: IncomingMessage, res: ServerResponse, url: URL) {
    const p = url.pathname;
    if (p === '/' || p === '/ar' || p === '/en' || p === '/ar/' || p === '/en/')
      return void res
        .writeHead(302, { location: `/${p.startsWith('/en') ? 'en' : 'ar'}/centre` })
        .end();
    const allowed =
      /^\/(ar|en)\/centre(\/|$)/.test(p) ||
      p.startsWith('/_next/') ||
      /^\/[\w.-]+\.(png|svg|ico|webp|woff2?|txt|json)$/.test(p) ||
      p.startsWith('/brand/') ||
      p.startsWith('/fonts/');
    if (!allowed)
      return void res
        .writeHead(404, { 'content-type': 'text/plain' })
        .end('Not part of the pilot.');
    const up = new URL(cfg.webUpstream);
    const headers = {
      ...req.headers,
      host: up.host,
      'x-forwarded-proto': url.protocol.slice(0, -1),
    };
    delete headers.cookie; // the owner web renders on the client; it never needs the session cookie
    const pr = httpRequest(
      { hostname: up.hostname, port: up.port, path: req.url, method: req.method, headers },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      },
    );
    pr.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end('The owner web is not running. Start it with pnpm pilot:start.');
    });
    req.pipe(pr);
  }

  return { auth, handle, api, runRetention };
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

/** Static files of the teacher app's web build; unknown paths fall back to index.html (SPA). */
export function serveStatic(root: string, pathname: string, res: ServerResponse) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  const file = join(root, rel);
  if (!file.startsWith(root + sep) && file !== root) return void res.writeHead(400).end();
  const target = existsSync(file) && statSync(file).isFile() ? file : join(root, 'index.html');
  if (!existsSync(target))
    return void res.writeHead(503, { 'content-type': 'text/plain' }).end('Teacher app not built.');
  const isIndex = target.endsWith('index.html');
  res.writeHead(200, {
    'content-type': TYPES[extname(target)] ?? 'application/octet-stream',
    'cache-control': isIndex ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  createReadStream(target).pipe(res);
}

export { COOKIE };
