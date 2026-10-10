import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { routes } from '../contract/routes';
import { Caller, CallerLang, Endpoint, type In, Input, type Principal } from '../platform/http';
import { requestIdOf } from '../platform/request-context';
import { Money } from '../payments/money';
import { Payouts } from './payouts';

/** Payout accounts, payout history and the ops finance payout desk (S3, MKT-OPS-11). */
@Controller()
export class PayoutsController {
  constructor(
    @Inject(Payouts) private readonly payouts: Payouts,
    @Inject(Money) private readonly money: Money,
  ) {}

  @Endpoint(routes.rentDue)
  rentDue(@Caller() p: Principal) {
    return this.money.rentDue(p.userId, p.lang);
  }

  @Endpoint(routes.rentTopupCheckout)
  payRent(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.rentTopupCheckout>,
    @Req() req: Request,
  ) {
    return this.money.rentTopupCheckout(
      p.userId,
      i.params.id,
      i.body.method,
      req.header('idempotency-key') ?? '',
      p.lang,
    );
  }

  @Endpoint(routes.myPayoutAccount)
  myAccount(@Caller() p: Principal) {
    return this.payouts.getAccount(p.userId, 'teacher');
  }

  @Endpoint(routes.putMyPayoutAccount)
  putMyAccount(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.putMyPayoutAccount>,
    @Req() req: Request,
  ) {
    return this.payouts.putAccount(p.userId, 'teacher', i.body, undefined, requestIdOf(req));
  }

  @Endpoint(routes.myPayouts)
  myPayouts(@Caller() p: Principal) {
    return this.payouts.history(p.userId, 'teacher');
  }

  @Endpoint(routes.centrePayoutAccount)
  centreAccount(@Caller() p: Principal, @Input() i: In<typeof routes.centrePayoutAccount>) {
    return this.payouts.getAccount(p.userId, 'centre', i.params.id);
  }

  @Endpoint(routes.putCentrePayoutAccount)
  putCentreAccount(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.putCentrePayoutAccount>,
    @Req() req: Request,
  ) {
    return this.payouts.putAccount(p.userId, 'centre', i.body, i.params.id, requestIdOf(req));
  }

  @Endpoint(routes.centrePayouts)
  centrePayouts(@Caller() p: Principal, @Input() i: In<typeof routes.centrePayouts>) {
    return this.payouts.history(p.userId, 'centre', i.params.id);
  }

  @Endpoint(routes.opsPayoutBatches)
  batches() {
    return this.payouts.batches();
  }

  @Endpoint(routes.opsRunPayouts)
  run(@Caller() p: Principal) {
    return this.payouts.runWeek(undefined, p.userId);
  }

  @Endpoint(routes.opsExportBatch)
  export(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.opsExportBatch>,
    @Req() req: Request,
  ) {
    return this.payouts.exportBatch(p.userId, i.params.id, requestIdOf(req));
  }

  @Endpoint(routes.opsPayouts)
  list(@Input() i: In<typeof routes.opsPayouts>) {
    return this.payouts.payouts(i.query.status ?? 'initiated');
  }

  @Endpoint(routes.settlePayout)
  settle(@Caller() p: Principal, @Input() i: In<typeof routes.settlePayout>, @Req() req: Request) {
    return this.payouts.settle(p.userId, i.params.id, i.body.reference, requestIdOf(req));
  }

  @Endpoint(routes.failPayout)
  fail(@Caller() p: Principal, @Input() i: In<typeof routes.failPayout>, @Req() req: Request) {
    return this.payouts.fail(p.userId, i.params.id, i.body.reason, requestIdOf(req));
  }

  @Endpoint(routes.retryPayout)
  retry(@Caller() p: Principal, @Input() i: In<typeof routes.retryPayout>, @Req() req: Request) {
    return this.payouts.retry(p.userId, i.params.id, requestIdOf(req));
  }

  @Endpoint(routes.opsPayoutAccounts)
  accounts(@CallerLang() lang: 'ar' | 'en') {
    return this.payouts.accountsToVerify(lang);
  }

  @Endpoint(routes.verifyPayoutAccount)
  verify(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.verifyPayoutAccount>,
    @Req() req: Request,
  ) {
    return this.payouts.decideAccount(p.userId, i.params.id, 'verify', undefined, requestIdOf(req));
  }

  @Endpoint(routes.rejectPayoutAccount)
  reject(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.rejectPayoutAccount>,
    @Req() req: Request,
  ) {
    return this.payouts.decideAccount(
      p.userId,
      i.params.id,
      'reject',
      i.body.reason,
      requestIdOf(req),
    );
  }
}
