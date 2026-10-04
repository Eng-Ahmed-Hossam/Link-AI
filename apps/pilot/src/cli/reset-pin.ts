/**
 * `pnpm pilot:reset-pin "<first name>"` — set a new PIN for someone, from the laptop (server stopped).
 * For the owner who forgot their PIN; everyone else gets a new PIN from the owner in Staff & access.
 */
import { recordAccessEvent, world } from '@link/mocks/followup';
import { PilotAuth } from '../auth';
import { args, config, fail, openStore, requireStopped } from './common';

const { pos } = args();
if (!pos[0]) fail('Usage: pnpm pilot:reset-pin "<first name>"');
const cfg = config();
requireStopped(cfg);
const store = openStore(cfg);
const matches = world().users.filter((u) => u.active && (u.name.ar === pos[0] || u.id === pos[0]));
if (matches.length !== 1)
  fail(
    matches.length
      ? `More than one person is called ${pos[0]}; use their id.`
      : `Nobody active is called ${pos[0]}.`,
  );
const u = matches[0]!;
const pin = new PilotAuth(store, {
  sessionHours: cfg.sessionHours,
  isActiveUser: () => true,
}).setPin(u.id);
recordAccessEvent('access.pin_reset', null, { userId: u.id, via: 'laptop' });
store.close();
console.log(
  `\n✔ New PIN for ${u.name.ar} (${u.role}): ${pin}\n  Give it to them in person. It is not shown again.\n`,
);
