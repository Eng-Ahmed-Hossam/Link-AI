import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { routes } from '../contract/routes';
import { Children } from '../org/children';
import { Database } from '../platform/db';
import { Caller, Endpoint, type In, Input, type Principal } from '../platform/http';
import { requestIdOf } from '../platform/request-context';
import { Accounts } from './accounts';

/** The signed-in person: profile, roles, children and consents (MKT-ACC-02, -03, -05; BR-DAT-03). */
@Controller()
export class MeController {
  constructor(
    @Inject(Database) private readonly db: Database,
    @Inject(Accounts) private readonly accounts: Accounts,
    @Inject(Children) private readonly children: Children,
  ) {}

  @Endpoint(routes.me)
  me(@Caller() p: Principal) {
    return this.accounts.me(p.userId);
  }

  @Endpoint(routes.updateMe)
  update(@Caller() p: Principal, @Input() i: In<typeof routes.updateMe>, @Req() req: Request) {
    return this.accounts.updateMe(p.userId, i.body, requestIdOf(req));
  }

  @Endpoint(routes.addRole)
  addRole(@Caller() p: Principal, @Input() i: In<typeof routes.addRole>, @Req() req: Request) {
    return this.accounts.addRole(p.userId, i.body.role, requestIdOf(req));
  }

  @Endpoint(routes.children)
  async list(@Caller() p: Principal) {
    return { data: await this.children.list(p.userId, p.lang), nextCursor: null };
  }

  @Endpoint(routes.addChild)
  add(@Caller() p: Principal, @Input() i: In<typeof routes.addChild>, @Req() req: Request) {
    return this.children.add(p.userId, i.body, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.consents)
  async consents(@Caller() p: Principal) {
    return { data: await this.children.consents(p.userId) };
  }

  @Endpoint(routes.putConsent)
  async putConsent(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.putConsent>,
    @Req() req: Request,
  ) {
    return { data: await this.children.putConsent(p.userId, i.body, requestIdOf(req)) };
  }
}
