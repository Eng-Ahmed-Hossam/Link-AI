import { Controller, Inject, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { routes } from '../contract/routes';
import type { Config } from '../config';
import {
  ACCESS_COOKIE,
  Caller,
  Endpoint,
  type In,
  Input,
  type Principal,
  REFRESH_COOKIE,
  usesCookies,
} from '../platform/http';
import { clientIp } from '../platform/client-ip';
import { CONFIG } from '../platform/di';
import { requestIdOf } from '../platform/request-context';
import { StudentAccounts } from './accounts';
import { Learning } from './learning';
import { Makeups } from './makeups';
import { Teaching } from './teaching';

/** Database v2 endpoints (docs/07 "Students"): accounts, student and parent reads, teacher and centre sides. */
@Controller()
export class StudentsController {
  constructor(
    @Inject(CONFIG) private readonly c: Config,
    @Inject(StudentAccounts) private readonly accounts: StudentAccounts,
    @Inject(Learning) private readonly learning: Learning,
    @Inject(Makeups) private readonly makeups: Makeups,
    @Inject(Teaching) private readonly teaching: Teaching,
  ) {}

  // ── Parent: the child's student account ──────────────────────────────────────
  @Endpoint(routes.createStudentAccount)
  create(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.createStudentAccount>,
    @Req() req: Request,
  ) {
    return this.accounts.create(p.userId, i.params.id, requestIdOf(req));
  }
  @Endpoint(routes.getStudentAccount)
  get(@Caller() p: Principal, @Input() i: In<typeof routes.getStudentAccount>) {
    return this.accounts.get(p.userId, i.params.id);
  }
  @Endpoint(routes.newStudentAccessCode)
  code(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.newStudentAccessCode>,
    @Req() req: Request,
  ) {
    return this.accounts.newCode(p.userId, i.params.id, requestIdOf(req));
  }
  @Endpoint(routes.pauseStudentAccount)
  pause(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.pauseStudentAccount>,
    @Req() req: Request,
  ) {
    return this.accounts.pause(p.userId, i.params.id, requestIdOf(req));
  }
  @Endpoint(routes.resumeStudentAccount)
  resume(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.resumeStudentAccount>,
    @Req() req: Request,
  ) {
    return this.accounts.resume(p.userId, i.params.id, requestIdOf(req));
  }
  @Endpoint(routes.signOutStudentEverywhere)
  signOut(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.signOutStudentEverywhere>,
    @Req() req: Request,
  ) {
    return this.accounts.signOutEverywhere(p.userId, i.params.id, requestIdOf(req));
  }
  @Endpoint(routes.removeStudentDevice)
  removeDevice(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.removeStudentDevice>,
    @Req() req: Request,
  ) {
    return this.accounts.removeDevice(p.userId, i.params.id, i.params.deviceId, requestIdOf(req));
  }

  // ── Student device sign-in ───────────────────────────────────────────────────
  @Endpoint(routes.redeemStudentCode)
  redeem(@Input() i: In<typeof routes.redeemStudentCode>, @Req() req: Request) {
    return this.accounts.redeem(i.body, clientIp(req, this.c.LINK_PROXY_SECRET), requestIdOf(req));
  }
  @Endpoint(routes.setStudentPin)
  async pin(
    @Input() i: In<typeof routes.setStudentPin>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const web = usesCookies(req);
    const s = await this.accounts.setPin(
      i.body.pinSetupToken,
      i.body.pin,
      web ? 'web' : 'app',
      requestIdOf(req),
    );
    return this.tokensOut(s, web, res);
  }
  @Endpoint(routes.studentSignIn)
  async signIn(
    @Input() i: In<typeof routes.studentSignIn>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const web = usesCookies(req);
    const s = await this.accounts.signIn(
      i.body,
      clientIp(req, this.c.LINK_PROXY_SECRET),
      web ? 'web' : 'app',
      requestIdOf(req),
    );
    return this.tokensOut(s, web, res);
  }

  /** The app gets the tokens in the body; the web gets httpOnly cookies (07 §1), as phone sign-in. */
  private tokensOut(
    s: { accessToken: string; refreshToken: string; student: unknown },
    web: boolean,
    res: Response,
  ) {
    if (!web) return s;
    const opts = { httpOnly: true, sameSite: 'lax' as const, secure: this.c.APP_ENV !== 'local' };
    res.cookie(ACCESS_COOKIE, s.accessToken, {
      ...opts,
      path: '/',
      maxAge: this.c.ACCESS_TOKEN_TTL * 1000,
    });
    res.cookie(REFRESH_COOKIE, s.refreshToken, {
      ...opts,
      path: '/v1/auth',
      maxAge: this.c.REFRESH_TOKEN_TTL * 1000,
    });
    return { student: s.student };
  }

  // ── Student and parent reads ─────────────────────────────────────────────────
  @Endpoint(routes.studentMe)
  studentMe(@Caller() p: Principal) {
    return this.accounts.me(p.userId, p.lang);
  }
  @Endpoint(routes.mySchedule)
  schedule(@Caller() p: Principal, @Input() i: In<typeof routes.mySchedule>) {
    return this.learning.schedule(p.userId, i.query, p.lang);
  }
  @Endpoint(routes.myScheduleChanges)
  myChanges(@Caller() p: Principal) {
    return this.learning.changes(p.userId, { kind: 'me' }, p.lang);
  }
  @Endpoint(routes.childScheduleChanges)
  childChanges(@Caller() p: Principal, @Input() i: In<typeof routes.childScheduleChanges>) {
    return this.learning.changes(p.userId, { kind: 'child', studentId: i.params.id }, p.lang);
  }
  @Endpoint(routes.myNotifications)
  notifications(@Caller() p: Principal) {
    return this.learning.notifications(p.userId);
  }
  @Endpoint(routes.readNotification)
  read(@Caller() p: Principal, @Input() i: In<typeof routes.readNotification>) {
    return this.learning.readNotification(p.userId, i.params.id);
  }
  @Endpoint(routes.myMissed)
  myMissed(@Caller() p: Principal) {
    return this.learning.missed(p.userId, { kind: 'me' }, p.lang);
  }
  @Endpoint(routes.childMissed)
  childMissed(@Caller() p: Principal, @Input() i: In<typeof routes.childMissed>) {
    return this.learning.missed(p.userId, { kind: 'child', studentId: i.params.id }, p.lang);
  }
  @Endpoint(routes.myHomework)
  myHomework(@Caller() p: Principal) {
    return this.learning.homework(p.userId, { kind: 'me' }, p.lang);
  }
  @Endpoint(routes.childHomework)
  childHomework(@Caller() p: Principal, @Input() i: In<typeof routes.childHomework>) {
    return this.learning.homework(p.userId, { kind: 'child', studentId: i.params.id }, p.lang);
  }
  @Endpoint(routes.myStudentNotes)
  myNotes(@Caller() p: Principal) {
    return this.learning.notes(p.userId, { kind: 'me' }, p.lang);
  }
  @Endpoint(routes.childStudentNotes)
  childNotes(@Caller() p: Principal, @Input() i: In<typeof routes.childStudentNotes>) {
    return this.learning.notes(p.userId, { kind: 'child', studentId: i.params.id }, p.lang);
  }
  @Endpoint(routes.myTopics)
  myTopics(@Caller() p: Principal, @Input() i: In<typeof routes.myTopics>) {
    return this.learning.topics(p.userId, { kind: 'me' }, i.query.groupId, p.lang);
  }
  @Endpoint(routes.childTopics)
  childTopics(@Caller() p: Principal, @Input() i: In<typeof routes.childTopics>) {
    return this.learning.topics(
      p.userId,
      { kind: 'child', studentId: i.params.id },
      i.query.groupId,
      p.lang,
    );
  }
  @Endpoint(routes.myFocusPlan)
  myFocus(@Caller() p: Principal) {
    return this.learning.focusPlans(p.userId, { kind: 'me' }, p.lang);
  }
  @Endpoint(routes.childFocusPlan)
  childFocus(@Caller() p: Principal, @Input() i: In<typeof routes.childFocusPlan>) {
    return this.learning.focusPlans(p.userId, { kind: 'child', studentId: i.params.id }, p.lang);
  }
  @Endpoint(routes.tickFocusItem)
  tick(@Caller() p: Principal, @Input() i: In<typeof routes.tickFocusItem>) {
    return this.learning.tick(p.userId, i.params.id, i.body.ticked);
  }

  // ── Make-up requests ─────────────────────────────────────────────────────────
  @Endpoint(routes.newMakeupRequest)
  newMakeup(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.newMakeupRequest>,
    @Req() req: Request,
  ) {
    return this.makeups.create(p.userId, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.withdrawMakeup)
  withdraw(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.withdrawMakeup>,
    @Req() req: Request,
  ) {
    return this.makeups.withdraw(p.userId, i.params.id, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.seenMakeup)
  seen(@Caller() p: Principal, @Input() i: In<typeof routes.seenMakeup>) {
    return this.makeups.seen(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.myMakeups)
  async myMakeups(@Caller() p: Principal) {
    return this.makeups.listFamily(p.userId, null, p.lang);
  }
  @Endpoint(routes.childMakeups)
  childMakeups(@Caller() p: Principal, @Input() i: In<typeof routes.childMakeups>) {
    return this.makeups.listFamily(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.centreMakeups)
  centreMakeups(@Caller() p: Principal, @Input() i: In<typeof routes.centreMakeups>) {
    return this.makeups.listCentre(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.acceptMakeup)
  accept(@Caller() p: Principal, @Input() i: In<typeof routes.acceptMakeup>, @Req() req: Request) {
    return this.makeups.accept(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.declineMakeup)
  decline(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.declineMakeup>,
    @Req() req: Request,
  ) {
    return this.makeups.decline(p.userId, i.params.id, i.body, p.lang, requestIdOf(req));
  }

  // ── Teacher and centre ───────────────────────────────────────────────────────
  @Endpoint(routes.moveSession)
  move(@Caller() p: Principal, @Input() i: In<typeof routes.moveSession>, @Req() req: Request) {
    return this.teaching.moveSession(p.userId, i.params.id, i.body, requestIdOf(req));
  }
  @Endpoint(routes.getSessionLearning)
  getLearning(@Caller() p: Principal, @Input() i: In<typeof routes.getSessionLearning>) {
    return this.teaching.learning(p.userId, i.params.id);
  }
  @Endpoint(routes.putSessionLearning)
  putLearning(@Caller() p: Principal, @Input() i: In<typeof routes.putSessionLearning>) {
    return this.teaching.putLearning(p.userId, i.params.id, i.body);
  }
  @Endpoint(routes.putHomeworkMarks)
  marks(@Caller() p: Principal, @Input() i: In<typeof routes.putHomeworkMarks>) {
    return this.teaching.homeworkMarks(p.userId, i.params.id, i.body);
  }
  @Endpoint(routes.correctLearning)
  correct(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.correctLearning>,
    @Req() req: Request,
  ) {
    return this.teaching.correctLearning(p.userId, i.params.id, i.body, requestIdOf(req));
  }
  @Endpoint(routes.newStudentNote)
  newNote(@Caller() p: Principal, @Input() i: In<typeof routes.newStudentNote>) {
    return this.teaching.newNote(p.userId, i.params.id, i.body, p.lang);
  }
  @Endpoint(routes.groupStudentNotes)
  groupNotes(@Caller() p: Principal, @Input() i: In<typeof routes.groupStudentNotes>) {
    return this.teaching.groupNotes(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.submitStudentNote)
  submit(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.submitStudentNote>,
    @Req() req: Request,
  ) {
    return this.teaching.submitNote(p.userId, i.params.id, p.lang, requestIdOf(req));
  }
  @Endpoint(routes.centreStudentNotes)
  centreNotes(@Caller() p: Principal, @Input() i: In<typeof routes.centreStudentNotes>) {
    return this.teaching.centreNotes(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.approveStudentNote)
  approve(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.approveStudentNote>,
    @Req() req: Request,
  ) {
    return this.teaching.decideNote(
      p.userId,
      i.params.id,
      { approve: true },
      p.lang,
      requestIdOf(req),
    );
  }
  @Endpoint(routes.rejectStudentNote)
  reject(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.rejectStudentNote>,
    @Req() req: Request,
  ) {
    return this.teaching.decideNote(
      p.userId,
      i.params.id,
      { approve: false, reason: i.body.reason },
      p.lang,
      requestIdOf(req),
    );
  }
  @Endpoint(routes.topicMap)
  topicMap(@Input() i: In<typeof routes.topicMap>, @Req() req: Request) {
    const lang = req.header('accept-language')?.toLowerCase().startsWith('en') ? 'en' : 'ar';
    return this.teaching.topicMap(i.query.subjectId, lang);
  }
  @Endpoint(routes.putItemTopics)
  tags(@Caller() p: Principal, @Input() i: In<typeof routes.putItemTopics>) {
    return this.teaching.putItemTopics(p.userId, i.params.id, i.body);
  }
  @Endpoint(routes.putQuestionMarks)
  questionMarks(@Caller() p: Principal, @Input() i: In<typeof routes.putQuestionMarks>) {
    return this.teaching.putQuestionMarks(p.userId, i.params.id, i.body);
  }
  @Endpoint(routes.groupTopicScores)
  groupScores(@Caller() p: Principal, @Input() i: In<typeof routes.groupTopicScores>) {
    return this.teaching.groupTopicScores(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.newFocusPlan)
  newPlan(@Caller() p: Principal, @Input() i: In<typeof routes.newFocusPlan>) {
    return this.teaching.newFocusPlan(p.userId, i.params.id, i.body, p.lang);
  }
  @Endpoint(routes.groupFocusPlans)
  groupPlans(@Caller() p: Principal, @Input() i: In<typeof routes.groupFocusPlans>) {
    return this.teaching.groupFocusPlans(p.userId, i.params.id, p.lang);
  }
  @Endpoint(routes.approveFocusPlan)
  approvePlan(
    @Caller() p: Principal,
    @Input() i: In<typeof routes.approveFocusPlan>,
    @Req() req: Request,
  ) {
    return this.teaching.approveFocusPlan(p.userId, i.params.id, p.lang, requestIdOf(req));
  }
}
