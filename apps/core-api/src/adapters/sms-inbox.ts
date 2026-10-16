import { randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Redises } from '../platform/redis';
import { CONFIG } from '../platform/di';
import type { Config } from '../config';
import type { SmsMessage, SmsSender } from './sms';

/**
 * The hosted staging's private code inbox (Stage 3, SMS_PROVIDER=inbox): SMS are not sent but kept
 * in Redis for an hour (the newest 200), and read only with HTTP Basic auth whose password is
 * SMS_SINK_TOKEN — the same answers as the local sms-sink (`/api/messages`), so the e2e helpers
 * read either. Sample data and testers only; production refuses SMS_PROVIDER=inbox (guard.ts).
 * (Railway's free plan allows no extra service for the sms-sink, so it lives in core-api.)
 */
const KEEP = 200;
const TTL_SECONDS = 3600;
export const inboxKey = (r: Redises) => r.key('staging', 'sms-inbox');

export class RedisInboxSender implements SmsSender {
  constructor(private readonly redis: Redises) {}

  async send(msg: SmsMessage) {
    const id = randomUUID();
    const item = {
      id,
      ...msg,
      templateCode: msg.templateCode ?? null,
      receivedAt: new Date().toISOString(),
    };
    await this.redis.state
      .multi()
      .lpush(inboxKey(this.redis), JSON.stringify(item))
      .ltrim(inboxKey(this.redis), 0, KEEP - 1)
      .expire(inboxKey(this.redis), TTL_SECONDS)
      .exec();
    return { providerMessageId: id };
  }
}

const digest = (v: string) => createHash('sha256').update(v).digest();
/** HTTP Basic auth, any user, the token as the password (constant time). */
export function inboxAuthorised(header: string | undefined, token: string) {
  const m = /^Basic\s+(.+)$/i.exec(header ?? '');
  if (!m || !token) return false;
  const pass = Buffer.from(m[1]!, 'base64').toString('utf8').split(':').slice(1).join(':');
  return timingSafeEqual(digest(pass), digest(token));
}

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** GET /__staging/sms (a page) and /__staging/sms/api/messages (JSON): registered only for the inbox. */
@Controller('__staging/sms')
export class SmsInboxController {
  private readonly token: string;
  constructor(
    @Inject(Redises) private readonly redis: Redises,
    @Inject(CONFIG) c: Config,
  ) {
    this.token = c.SMS_SINK_TOKEN ?? '';
  }

  private async items() {
    const raw = await this.redis.state.lrange(inboxKey(this.redis), 0, KEEP - 1);
    return raw.map((x) => JSON.parse(x) as { to: string; body: string; receivedAt: string });
  }

  private denied(req: Request, res: Response) {
    if (inboxAuthorised(req.header('authorization'), this.token)) return false;
    res
      .status(401)
      .setHeader('www-authenticate', 'Basic realm="Link staging codes"')
      .setHeader('cache-control', 'no-store')
      .end();
    return true;
  }

  @Get('api/messages')
  async json(@Req() req: Request, @Res() res: Response) {
    if (this.denied(req, res)) return;
    res.setHeader('cache-control', 'no-store').json({ items: await this.items() });
  }

  @Get()
  async page(@Req() req: Request, @Res() res: Response) {
    if (this.denied(req, res)) return;
    const rows = (await this.items())
      .map(
        (m) =>
          `<tr><td>${esc(m.receivedAt)}</td><td dir="ltr">${esc(m.to)}</td><td>${esc(m.body)}</td></tr>`,
      )
      .join('');
    res
      .setHeader('cache-control', 'no-store')
      .type('html')
      .send(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="5"><title>Link staging · codes</title></head><body style="font-family:system-ui;margin:24px"><h1 style="font-size:18px">Link staging · sign-in codes (sample data, newest first, kept 1 hour)</h1><table cellpadding="6" border="1" style="border-collapse:collapse"><tr><th>When (UTC)</th><th>To</th><th>Message</th></tr>${rows || '<tr><td colspan="3">No codes yet.</td></tr>'}</table></body></html>`,
      );
  }
}
