import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { routes } from '../contract/routes';
import { Reports } from '../ledger/reports';
import { Money } from '../payments/money';
import { Caller, Endpoint, type In, Input, type Principal } from '../platform/http';
import { requestIdOf } from '../platform/request-context';
import { Enrolments } from './enrolments';

const keyOf = (req: Request) => req.header('idempotency-key') ?? '';

/** Enrolment, payment, waitlist and the money statements (07 §2). */
@Controller()
export class EnrolmentsController {
  constructor(
    @Inject(Enrolments) private readonly enrolments: Enrolments,
    @Inject(Money) private readonly money: Money,
    @Inject(Reports) private readonly reports: Reports,
  ) {}

  @Endpoint(routes.createEnrolment)
  create(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.createEnrolment>,
    @Req() req: Request,
  ) {
    return this.enrolments.create(p.userId, i.body, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.checkout)
  checkout(@Caller() p: Principal, @Input() i: In<typeof routes.checkout>, @Req() req: Request) {
    return this.enrolments.checkout(p.userId, i.params.id, i.body.method, keyOf(req), p.lang);
  }

  @Endpoint(routes.enrolment)
  get(@Caller() p: Principal, @Input() i: In<typeof routes.enrolment>) {
    return this.enrolments.get(p.userId, i.params.id, p.lang);
  }

  @Endpoint(routes.myEnrolments)
  mine(@Caller() p: Principal) {
    return this.enrolments.mine(p.userId, p.lang);
  }

  @Endpoint(routes.cancelEnrolment)
  cancel(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.cancelEnrolment>,
    @Req() req: Request,
  ) {
    return this.enrolments.cancel(p.userId, i.params.id, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.cancelPlan)
  cancelPlan(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.cancelPlan>,
    @Req() req: Request,
  ) {
    return this.enrolments.cancelPlan(p.userId, i.params.id, p.lang, requestIdOf(req));
  }

  @Endpoint(routes.refundRequest)
  refund(@Caller() p: Principal, @Input() i: In<typeof routes.refundRequest>) {
    return this.enrolments.disputeRefund(p.userId, i.params.id, i.body?.reason, p.lang);
  }

  @Endpoint(routes.teacherEnrolments)
  teacherList(@Caller() p: Principal) {
    return this.enrolments.teacherList(p.userId, p.lang);
  }

  @Endpoint(routes.acceptEnrolment)
  async accept(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.acceptEnrolment>,
    @Req() req: Request,
  ) {
    const list = await this.enrolments.decide(
      p.userId,
      i.params.id,
      true,
      p.lang,
      requestIdOf(req),
    );
    return list.find((x) => x.id === i.params.id) ?? null;
  }

  @Endpoint(routes.declineEnrolment)
  async decline(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.declineEnrolment>,
    @Req() req: Request,
  ) {
    const list = await this.enrolments.decide(
      p.userId,
      i.params.id,
      false,
      p.lang,
      requestIdOf(req),
    );
    return list.find((x) => x.id === i.params.id) ?? null;
  }

  @Endpoint(routes.joinWaitlist)
  join(@Caller() p: Principal, @Input() i: In<typeof routes.joinWaitlist>) {
    return this.enrolments.joinWaitlist(p.userId, i.params.id, i.body.studentId);
  }

  @Endpoint(routes.acceptWaitlistOffer)
  acceptOffer(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.acceptWaitlistOffer>,
    @Req() req: Request,
  ) {
    return this.enrolments.acceptOffer(p.userId, i.params.id, i.body, keyOf(req), p.lang);
  }

  @Endpoint(routes.leaveWaitlist)
  async leave(@Caller() p: Principal, @Input() i: In<typeof routes.leaveWaitlist>) {
    await this.enrolments.leaveWaitlist(p.userId, i.params.id);
  }

  @Endpoint(routes.paymentWebhook)
  webhook(@Input() i: In<typeof routes.paymentWebhook>, @Req() req: Request) {
    return this.money.webhook(
      i.params.provider,
      req.headers,
      (req as { rawBody?: Buffer }).rawBody,
    );
  }

  @Endpoint(routes.earnings)
  earnings(@Caller() p: Principal) {
    return this.reports.earnings(p.userId, p.lang);
  }

  @Endpoint(routes.rentIncome)
  rentIncome(@Caller() p: Principal, @Input() i: In<typeof routes.rentIncome>) {
    return this.reports.rentIncome(p.userId, i.params.id, p.lang);
  }
}
