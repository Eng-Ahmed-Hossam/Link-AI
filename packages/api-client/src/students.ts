/**
 * Database v2 types (student accounts; what students and parents read; the teacher and centre
 * sides): aliases of the generated contract (apps/core-api/src/contract/students.ts), never
 * hand-written shapes. The screens come later (docs/plan/database-v2.md).
 */
import type { components } from './generated/openapi';

type S = components['schemas'];
export type StudentAccount = S['StudentAccount'];
export type StudentDevice = S['StudentDevice'];
export type StudentAccessCode = S['StudentAccessCode'];
export type StudentRedeemBody = S['StudentRedeemBody'];
export type StudentRedeemResult = S['StudentRedeemResult'];
export type StudentPinBody = S['StudentPinBody'];
export type StudentSignInBody = S['StudentSignInBody'];
export type StudentTokens = S['StudentTokens'];
export type StudentMe = S['StudentMe'];
export type ScheduleSession = S['ScheduleSession'];
export type SessionChange = S['SessionChange'];
export type InAppNotification = S['InAppNotification'];
export type MoveSessionBody = S['MoveSessionBody'];
export type MissedSession = S['MissedSession'];
export type HomeworkItemView = S['HomeworkItemView'];
export type SessionLearning = S['SessionLearning'];
export type SessionLearningBody = S['SessionLearningBody'];
export type HomeworkMarksBody = S['HomeworkMarksBody'];
export type MakeupRequest = S['MakeupRequest'];
export type NewMakeupBody = S['NewMakeupBody'];
export type AcceptMakeupBody = S['AcceptMakeupBody'];
export type StudentNote = S['StudentNote'];
export type TopicMap = S['TopicMap'];
export type ItemTopicsBody = S['ItemTopicsBody'];
export type TopicScore = S['TopicScore'];
export type SubjectProgress = S['SubjectProgress'];
export type StudentProgress = S['StudentProgress'];
export type TeacherTopicScores = S['TeacherTopicScores'];
export type FocusPlan = S['FocusPlan'];
export type NewFocusPlanBody = S['NewFocusPlanBody'];
