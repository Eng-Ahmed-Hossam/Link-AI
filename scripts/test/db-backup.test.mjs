// pnpm test:scripts — db:backup / db:restore touch only the local database, and name each dump
// by its time and commit (docs/plan/database-v2.md §7). The real dump-and-restore round trip was
// run on Windows by hand (report of D1).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backupName, backupProblems } from '../lib/db-backup.mjs';

const LOCAL = 'postgres://app_migrator:x@localhost:5432/link';

describe('db backup', () => {
  it('names a dump by local time and the commit', () => {
    assert.equal(
      backupName(new Date(2026, 9, 16, 9, 5, 3), 'bb1bc5e0123'),
      'link-20261016-090503-bb1bc5e.dump',
    );
    assert.equal(backupName(new Date(2026, 0, 1, 0, 0, 0), ''), 'link-20260101-000000-nogit.dump');
  });

  it('backs up and restores only the local database', () => {
    assert.deepEqual(backupProblems({ APP_ENV: 'local', DATABASE_URL_MIGRATOR: LOCAL }), []);
    assert.equal(backupProblems({ APP_ENV: 'staging', DATABASE_URL_MIGRATOR: LOCAL }).length, 1);
    assert.equal(
      backupProblems({
        APP_ENV: 'local',
        DATABASE_URL_MIGRATOR: 'postgres://u:p@postgres.railway.internal:5432/railway',
      }).length,
      1,
    );
    assert.equal(backupProblems({}).length, 2);
  });
});
