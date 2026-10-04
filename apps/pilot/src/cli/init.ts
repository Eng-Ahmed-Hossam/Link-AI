/**
 * `pnpm pilot:init --centre "<name>" --start YYYY-MM-DD [--end YYYY-MM-DD] --owner "<first name>"`
 *
 * Creates the pilot data on the encrypted drive: the centre, the owner (with a PIN shown once), the
 * rule defaults. No group, student, record or demo data — the roster comes from `pnpm pilot:import`.
 */
import { freshPilotState } from '@link/mocks/followup';
import { PILOT_CENTRE_ID } from '../app';
import { PilotAuth } from '../auth';
import { PilotStore, type Snapshot } from '../store';
import { args, config, fail } from './common';

const { opts } = args();
const cfg = config();
const centre = typeof opts.centre === 'string' ? opts.centre.trim() : '';
const start = typeof opts.start === 'string' ? opts.start : '';
const end = typeof opts.end === 'string' ? opts.end : null;
const owner = typeof opts.owner === 'string' ? opts.owner.trim() : '';
const ymd = /^\d{4}-\d{2}-\d{2}$/;
if (!centre) fail('Give the centre name: --centre "<name>".');
if (!ymd.test(start)) fail('Give the pilot start date: --start YYYY-MM-DD.');
if (end && (!ymd.test(end) || end < start)) fail('--end must be a date on or after --start.');
if (!owner || [...owner].length > 40) fail('Give the owner first name: --owner "<name>".');

const store = new PilotStore(cfg.dataDir);
if (store.exists) fail(`Pilot data already exists in ${cfg.dataDir}. Nothing was changed.`);

const ownerId = 'usr-p001';
const fu = freshPilotState({
  kind: 'pilot',
  centre: { id: PILOT_CENTRE_ID, name: { ar: centre, en: centre } },
  groups: [],
  members: [],
  students: [],
  guardians: [],
  users: [
    {
      id: ownerId,
      name: { ar: owner, en: owner },
      role: 'owner',
      title: { en: 'Owner', ar: 'المالك' },
      active: true,
    },
  ],
  startDate: start,
});
const snap: Snapshot = {
  version: 1,
  meta: {
    version: 1,
    centreName: centre,
    startDate: start,
    endDate: end,
    createdAt: new Date().toISOString(),
  },
  auth: { pins: {}, lock: {}, sessions: {} },
  fu,
};
store.create(snap);
const auth = new PilotAuth(store, { sessionHours: cfg.sessionHours, isActiveUser: () => true });
const pin = auth.setPin(ownerId);
store.close();

console.log(`
✔ Pilot created for "${centre}" (from ${start}${end ? ` to ${end}` : ''}).
  Data: ${cfg.dataDir}

  Owner: ${owner}
  PIN:   ${pin}

  Write the PIN down now and give it to the owner. It is not shown again
  (the owner can set a new one from Staff & access).

Next: pnpm pilot:import <roster.csv> --schedule <schedule.csv>
`);
