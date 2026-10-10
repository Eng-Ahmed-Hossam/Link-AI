/** The console sections and the permission each needs (OD-37). */
export const SECTIONS = {
  centres: 'ops.verify',
  teachers: 'ops.verify',
  reviews: 'ops.moderate',
  refunds: 'ops.finance',
  payouts: 'ops.finance',
  'data-requests': 'ops.verify',
} as const;
export type Section = keyof typeof SECTIONS;
