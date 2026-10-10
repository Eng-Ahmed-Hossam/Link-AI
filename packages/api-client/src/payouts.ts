/**
 * Payout and rent-shortfall types (S3): aliases of the generated contract
 * (apps/core-api/src/contract/payouts.ts), never hand-written shapes.
 */
import type { components } from './generated/openapi';

type S = components['schemas'];
export type PayoutAccount = S['PayoutAccount'];
export type PayoutAccountBody = S['PayoutAccountBody'];
export type PayoutRow = S['PayoutRow'];
export type PayoutBatch = S['PayoutBatch'];
export type OpsPayout = S['OpsPayout'];
export type OpsPayoutAccount = S['OpsPayoutAccount'];
export type PayoutRun = S['PayoutRun'];
export type PayoutExport = S['PayoutExport'];
export type RentDue = S['RentDue'];
