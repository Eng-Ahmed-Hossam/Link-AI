import {
  RateLimiter,
  isSpam,
  pilotEmail,
  redact,
  validatePilotRequest,
  type PilotRequest,
} from '../../../src/pilot-request';

/**
 * POST /api/pilot-request — the landing page's "Request a free pilot" (path B, ADR-0009).
 * Validates, drops honeypot hits, rate-limits per address, then emails the request to
 * `PILOT_REQUEST_TO` through Resend. With no key (local dev) it prints a redacted line instead.
 * Never stores a request and never logs its contents.
 */
const limiter = new RateLimiter(5, 10 * 60_000);

const problem = (status: number, code: string, title: string, extra: object = {}) =>
  Response.json(
    { type: `https://docs.link.eg/errors/${code}`, title, status, code, ...extra },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

type Env = Record<string, string | undefined>;
type Send = (r: PilotRequest, env: Env) => Promise<boolean>;

/** Resend's HTTP API (free tier: 3,000 emails a month, 100 a day). */
export const sendWithResend: Send = async (r, env) => {
  const mail = pilotEmail(r);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.EMAIL_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'Link <onboarding@resend.dev>',
      to: [env.PILOT_REQUEST_TO],
      subject: mail.subject,
      text: mail.text,
    }),
  });
  if (!res.ok) console.error(`[pilot-request] email provider answered HTTP ${res.status}`);
  return res.ok;
};

export async function handlePilotRequest(
  req: Request,
  env: Env = process.env,
  send: Send = sendWithResend,
  rate: RateLimiter = limiter,
): Promise<Response> {
  const raw = await req.text();
  if (raw.length > 4096) return problem(413, 'too_large', 'Request too large.');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return problem(400, 'validation_failed', 'Invalid JSON.', { errors: [] });
  }
  // A bot filled the hidden field: answer like a success, send nothing.
  if (isSpam(body)) return Response.json({ ok: true });
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (!rate.hit(ip)) return problem(429, 'rate_limited', 'Too many requests. Try again later.');
  const v = validatePilotRequest(body);
  if (!v.ok) return problem(400, 'validation_failed', 'Check the form.', { errors: v.errors });

  if (!env.EMAIL_API_KEY || !env.PILOT_REQUEST_TO) {
    console.info('[pilot-request] no email key set — request not sent:', redact(v.value));
    return Response.json({ ok: true, delivered: false });
  }
  const ok = await send(v.value, env).catch(() => false);
  if (!ok) return problem(502, 'email_failed', 'The request could not be sent.');
  return Response.json({ ok: true, delivered: true });
}
