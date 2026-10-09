// pnpm ops:verify-centre <centreId|phone> — LOCAL ONLY: mark a centre verified as Link ops would
// (pending C01 centres, or a moved pin under review). Writes an audit row. Sample data only.
import { loadConfig } from '../src/config';
import { Phones } from '../src/identity/phone';
import { verifyCentre } from '../src/ops/verify-centre';
import { FieldCipher, LocalKeyWrapper } from '../src/platform/crypto';
import { Database } from '../src/platform/db';

const ref = process.argv[2];
if (!ref) {
  console.error('Usage: pnpm ops:verify-centre <centreId|phone>');
  process.exit(1);
}
const c = loadConfig();
if (c.APP_ENV !== 'local') {
  console.error(
    'ops:verify-centre is a local stand-in for the ops console: APP_ENV must be local.',
  );
  process.exit(1);
}
const db = new Database(c.DATABASE_URL, c.DATABASE_URL_WORKER);
try {
  const phones = new Phones(
    c.HMAC_KEY_LOOKUP,
    new FieldCipher(new LocalKeyWrapper(c.FIELD_KEY_LOCAL!)),
  );
  const done = await verifyCentre(db, phones, ref, 'ops_cli');
  for (const x of done) console.log(`✔ Verified: ${x.name} (${x.id})`);
} catch (e) {
  console.error(`✖ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
