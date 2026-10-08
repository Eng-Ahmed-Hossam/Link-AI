import { Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createTranslator } from '@link/i18n';
import { routes } from '../contract/routes';
import type { Config } from '../config';
import { Database } from '../platform/db';
import { CONFIG } from '../platform/di';
import {
  ACCESS_COOKIE,
  Endpoint,
  type In,
  Input,
  langOf,
  REFRESH_COOKIE,
  usesCookies,
} from '../platform/http';
import { unauthenticated } from '../platform/problem';
import { requestIdOf } from '../platform/request-context';
import { Accounts } from './accounts';
import { OtpService } from './otp';
import { toE164 } from './phone';
import { type Client, Tokens } from './tokens';

/** The client's IP for the per-IP OTP limit (behind a proxy, Express' trust proxy decides). */
const ipOf = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'unknown';

/**
 * Phone sign-in (MKT-ACC-01, -02, -04). The teacher app gets the tokens in the body; the web gets
 * them as httpOnly cookies (07 §1) and never sees them.
 */
@Controller()
export class AuthController {
  constructor(
    @Inject(CONFIG) private readonly c: Config,
    @Inject(Database) private readonly db: Database,
    @Inject(OtpService) private readonly otp: OtpService,
    @Inject(Accounts) private readonly accounts: Accounts,
    @Inject(Tokens) private readonly tokens: Tokens,
  ) {}

  @Endpoint(routes.otpRequest)
  request(@Input() i: In<typeof routes.otpRequest>, @Req() req: Request) {
    return this.otp.request(toE164(i.body.phone), ipOf(req), createTranslator(langOf(req)));
  }

  @Endpoint(routes.otpVerify)
  async verify(
    @Input() i: In<typeof routes.otpVerify>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const e164 = toE164(i.body.phone);
    await this.otp.verify(e164, i.body.code);
    const lang = langOf(req);
    const { userId, isNewUser } = await this.accounts.signIn(e164, lang, requestIdOf(req));
    const client: Client = usesCookies(req) ? 'web' : 'app';
    const { user, accessToken } = await this.issue(userId, lang);
    const refreshToken = await this.tokens.startSession(userId, client);
    if (client === 'web') {
      this.setCookies(res, accessToken, refreshToken);
      return { user, isNewUser };
    }
    return { accessToken, refreshToken, user, isNewUser };
  }

  @Endpoint(routes.refresh)
  async refresh(
    @Input() i: In<typeof routes.refresh>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const web = usesCookies(req);
    const presented = web ? this.refreshCookie(req) : i.body?.refreshToken;
    if (!presented) throw unauthenticated('refresh_invalid', 'Sign in again to continue.');
    const { userId, refreshToken } = await this.tokens.rotate(presented, web ? 'web' : 'app');
    const { accessToken } = await this.issue(userId, langOf(req));
    if (web) {
      this.setCookies(res, accessToken, refreshToken);
      return {};
    }
    return { accessToken, refreshToken };
  }

  @Endpoint(routes.logout)
  async logout(
    @Input() i: In<typeof routes.logout>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = usesCookies(req) ? this.refreshCookie(req) : i.body?.refreshToken;
    if (presented) await this.tokens.revoke(presented);
    const opts = this.cookieOptions();
    res.clearCookie(ACCESS_COOKIE, { ...opts, path: '/' });
    res.clearCookie(REFRESH_COOKIE, { ...opts, path: '/v1/auth' });
  }

  private refreshCookie(req: Request) {
    return (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  }

  /** A fresh access token for the user's current roles, plus the `Me` view. */
  private issue(userId: string, lang: 'ar' | 'en') {
    return this.db.asUser(userId, async (tx, ctx) => ({
      user: await this.accounts.meIn(tx, ctx),
      accessToken: await this.tokens.access(userId, ctx, lang),
    }));
  }

  private cookieOptions() {
    return { httpOnly: true, sameSite: 'lax' as const, secure: this.c.APP_ENV !== 'local' };
  }

  private setCookies(res: Response, access: string, refresh: string) {
    const opts = this.cookieOptions();
    res.cookie(ACCESS_COOKIE, access, {
      ...opts,
      path: '/',
      maxAge: this.c.ACCESS_TOKEN_TTL * 1000,
    });
    res.cookie(REFRESH_COOKIE, refresh, {
      ...opts,
      path: '/v1/auth',
      maxAge: this.c.REFRESH_TOKEN_TTL * 1000,
    });
  }
}
