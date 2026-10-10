/**
 * Ops console and data-subject request types (S2): aliases of the generated contract
 * (apps/core-api/src/contract/ops.ts), never hand-written shapes.
 */
import type { components } from './generated/openapi';

type S = components['schemas'];
export type OpsPermission = S['OpsPermission'];
export type OpsMe = S['OpsMe'];
export type OpsNote = S['OpsNote'];
export type VerificationCheck = S['VerificationCheck'];
export type VerificationCheckCode = VerificationCheck['code'];
export type VerificationCheckStatus = VerificationCheck['status'];
export type CentreStage = S['CentreStage'];
export type CentreApplication = S['CentreApplication'];
export type CentreApplications = S['CentreApplications'];
export type OpsLead = S['OpsLead'];
export type OpsTeacher = S['OpsTeacher'];
export type ReviewQueueItem = S['ReviewQueueItem'];
export type OpsRefund = S['OpsRefund'];
export type AuditRow = S['AuditRow'];
export type DataRequestKind = S['DataRequestKind'];
export type DataRequest = S['DataRequest'];
export type OpsDataRequest = S['OpsDataRequest'];
export type OpsNoteSubject = 'centre' | 'teacher' | 'lead' | 'refund' | 'review' | 'data_request';
