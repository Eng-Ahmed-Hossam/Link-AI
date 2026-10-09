// pnpm ops:refunds list | approve <id> | deny <id> "<reason>" — LOCAL ONLY: decide parent refund
// requests as Link ops would (OD-42). Approving posts the reversing entries (P7/P8) and asks the
// provider (fake-pay) to send the money; denying posts nothing. Both are audited. Sample data only.
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { coreProviders } from '../src/app.module';
import { loadConfig } from '../src/config';
import { approveRefundRequest, denyRefundRequest, refundRequests } from '../src/ops/refunds';
import { Database } from '../src/platform/db';
import { createLogger } from '../src/platform/logger';
import { Redises } from '../src/platform/redis';
import { Money } from '../src/payments/money';

const USAGE = 'Usage: pnpm ops:refunds list | approve <refundId> | deny <refundId> "<reason>"';
const [cmd, id, ...rest] = process.argv.slice(2);
const c = loadConfig();
if (c.APP_ENV !== 'local') {
  console.error('ops:refunds is a local stand-in for the ops console: APP_ENV must be local.');
  process.exit(1);
}
if (!['list', 'approve', 'deny'].includes(cmd ?? '') || (cmd !== 'list' && !id)) {
  console.error(USAGE);
  process.exit(1);
}
const app = await NestFactory.createApplicationContext(
  {
    module: class OpsModule {},
    providers: coreProviders(c, createLogger('warn', 'ops')),
    global: true,
  },
  { logger: ['error'] },
);
const db = app.get(Database);
const egp = (pt: number) => (pt / 100).toFixed(2);
try {
  if (cmd === 'list') {
    const rows = await refundRequests(db);
    if (!rows.length) console.log('No refund requests waiting.');
    for (const r of rows)
      console.log(
        `${r.id}  EGP ${egp(r.amountPt)}  ${r.policy}${r.autoEligible ? ' (auto-eligible)' : ''}  ${r.centre ?? ''}  ${r.requestedAt.slice(0, 16)}  ${r.reason ?? ''}`,
      );
  } else if (cmd === 'approve') {
    await approveRefundRequest(db, app.get(Money), id!);
    console.log(`✔ Approved ${id}: reversing entries posted; the refund was sent to the provider.`);
  } else {
    await denyRefundRequest(db, id!, rest.join(' '));
    console.log(`✔ Denied ${id}. Nothing was posted; the parent sees "Refund not approved".`);
  }
} catch (e) {
  console.error(`✖ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await app.close();
  await Promise.allSettled([db.close(), app.get(Redises).close()]);
}
