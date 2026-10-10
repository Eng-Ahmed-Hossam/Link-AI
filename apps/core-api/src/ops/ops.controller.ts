import { Controller, Inject, Req } from '@nestjs/common';
import type { Request } from 'express';
import { routes } from '../contract/routes';
import { DataRequests } from '../identity/data-requests';
import {
  Caller,
  CallerLang,
  Endpoint,
  type In,
  Input,
  OpsPermissions,
  type Principal,
} from '../platform/http';
import { requestIdOf } from '../platform/request-context';
import type { OpsPermission } from './access';
import { OpsConsole } from './console';

/** The ops console API (S2). The AuthGuard has checked the address, the role and the permission. */
@Controller()
export class OpsController {
  constructor(
    @Inject(OpsConsole) private readonly ops: OpsConsole,
    @Inject(DataRequests) private readonly requests: DataRequests,
  ) {}

  @Endpoint(routes.opsMe)
  me(@Caller() p: Principal, @OpsPermissions() perms: OpsPermission[]) {
    return this.ops.me(p.userId, perms);
  }

  @Endpoint(routes.centreApplications)
  centres(@Caller() p: Principal, @Input() i: In<typeof routes.centreApplications>) {
    return this.ops.centreApplications(p.userId, i.query.stage);
  }

  @Endpoint(routes.putCheck)
  putCheck(@Caller() p: Principal, @Input() i: In<typeof routes.putCheck>, @Req() req: Request) {
    const { subjectType, subjectId, checkCode } = i.params;
    return this.ops.putCheck(
      p.userId,
      subjectType,
      subjectId,
      checkCode,
      i.body.status,
      i.body.notes,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.centreStage)
  stage(@Caller() p: Principal, @Input() i: In<typeof routes.centreStage>, @Req() req: Request) {
    return this.ops.setCentreStage(p.userId, i.params.id, i.body.stage, requestIdOf(req));
  }

  @Endpoint(routes.approveCentre)
  approveCentre(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.approveCentre>,
    @Req() req: Request,
  ) {
    return this.ops.approveCentre(p.userId, i.params.id, requestIdOf(req));
  }

  @Endpoint(routes.rejectCentre)
  rejectCentre(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.rejectCentre>,
    @Req() req: Request,
  ) {
    return this.ops.rejectCentre(p.userId, i.params.id, i.body.reason, requestIdOf(req));
  }

  @Endpoint(routes.revokeCentre)
  revokeCentre(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.revokeCentre>,
    @Req() req: Request,
  ) {
    return this.ops.revokeCentre(p.userId, i.params.id, i.body.reason, requestIdOf(req));
  }

  @Endpoint(routes.opsAddNote)
  note(@Caller() p: Principal, @Input() i: In<typeof routes.opsAddNote>, @Req() req: Request) {
    return this.ops.addNote(p.userId, i.body, requestIdOf(req));
  }

  @Endpoint(routes.leadStatus)
  lead(@Caller() p: Principal, @Input() i: In<typeof routes.leadStatus>, @Req() req: Request) {
    return this.ops.leadStatus(p.userId, i.params.id, i.body.status, requestIdOf(req));
  }

  @Endpoint(routes.opsTeachers)
  teachers(
    @Caller() p: Principal,
    @CallerLang() lang: 'ar' | 'en',
    @Input() i: In<typeof routes.opsTeachers>,
  ) {
    return this.ops.teachers(p.userId, lang, i.query.verification);
  }

  @Endpoint(routes.verifyTeacher)
  verifyTeacher(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.verifyTeacher>,
    @Req() req: Request,
  ) {
    return this.ops.decideTeacher(
      p.userId,
      i.params.id,
      'verified',
      i.body.reason,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.rejectTeacher)
  rejectTeacher(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.rejectTeacher>,
    @Req() req: Request,
  ) {
    return this.ops.decideTeacher(
      p.userId,
      i.params.id,
      'rejected',
      i.body.reason,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.revokeTeacher)
  revokeTeacher(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.revokeTeacher>,
    @Req() req: Request,
  ) {
    return this.ops.decideTeacher(
      p.userId,
      i.params.id,
      'revoked',
      i.body.reason,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.reviewQueue)
  reviews(@Caller() p: Principal) {
    return this.ops.reviewQueue(p.userId);
  }

  @Endpoint(routes.reviewDecision)
  decideReview(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.reviewDecision>,
    @Req() req: Request,
  ) {
    return this.ops.decideReview(
      p.userId,
      i.params.id,
      i.body.decision,
      i.body.note,
      requestIdOf(req),
    );
  }

  @Endpoint(routes.opsRefunds)
  refunds(@Caller() p: Principal, @Input() i: In<typeof routes.opsRefunds>) {
    return this.ops.refunds(p.userId, i.query.status);
  }

  @Endpoint(routes.approveRefund)
  approveRefund(@Caller() p: Principal, @Input() i: In<typeof routes.approveRefund>) {
    return this.ops.approveRefund(p.userId, i.params.id);
  }

  @Endpoint(routes.rejectRefund)
  rejectRefund(@Caller() p: Principal, @Input() i: In<typeof routes.rejectRefund>) {
    return this.ops.rejectRefund(p.userId, i.params.id, i.body.reason);
  }

  @Endpoint(routes.opsAudit)
  audit(@Caller() p: Principal, @Input() i: In<typeof routes.opsAudit>) {
    return this.ops.audit(p.userId, i.query.objectType, i.query.objectRef);
  }

  @Endpoint(routes.opsDataRequests)
  dataRequests(@Caller() p: Principal, @Input() i: In<typeof routes.opsDataRequests>) {
    return this.ops.dataRequests(p.userId, i.query.status);
  }

  @Endpoint(routes.exportDataRequest)
  exportDataRequest(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.exportDataRequest>,
    @Req() req: Request,
  ) {
    return this.ops.exportDataRequest(p.userId, i.params.id, requestIdOf(req));
  }

  @Endpoint(routes.completeDataRequest)
  completeDataRequest(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.completeDataRequest>,
    @Req() req: Request,
  ) {
    return this.ops.completeDataRequest(
      p.userId,
      i.params.id,
      i.body.result,
      i.body.outcome,
      requestIdOf(req),
    );
  }

  // ── The person's own data requests ────────────────────────────────────────────
  @Endpoint(routes.myDataRequests)
  myDataRequests(@Caller() p: Principal) {
    return this.requests.list(p.userId);
  }

  @Endpoint(routes.createDataRequest)
  createDataRequest(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.createDataRequest>,
    @Req() req: Request,
  ) {
    return this.requests.create(p.userId, i.body, requestIdOf(req));
  }
}
