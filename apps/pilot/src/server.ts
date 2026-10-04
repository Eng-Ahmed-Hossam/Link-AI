/**
 * `pnpm pilot:start` — the concierge pilot server (docs/pilot/runbook.md).
 *
 * Listens on the centre LAN address only (HTTPS, local CA from `pnpm pilot:cert`), plus plain HTTP
 * on 127.0.0.1 for the laptop itself. Two surfaces:
 *   https://<LAN>:8443 — the owner web (Reception, owner); https://<LAN>:8444 — the teacher app.
 * Refuses to start if the start-up check finds anything from the demo (A1).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createServer as createHttp, type Server } from 'node:http';
import { createServer as createHttps } from 'node:https';
import { join } from 'node:path';
import { configureFollowupStore } from '@link/mocks/followup';
import { createPilotApp } from './app';
import { startupProblems } from './check';
import { REPO_ROOT, pilotConfig } from './config';
import { LOCK_REFRESH_MS, PilotStore, backup, refreshLock, releaseLock, takeLock } from './store';

const cfg = pilotConfig();
if (process.env.LINK_MODE !== 'pilot') {
  console.error('pilot: refusing to start — set LINK_MODE=pilot.');
  process.exit(1);
}
const store = new PilotStore(cfg.dataDir);
if (!store.exists) {
  console.error(`pilot: no pilot data in ${cfg.dataDir}. Run pnpm pilot:init first.`);
  process.exit(1);
}
takeLock(cfg.dataDir);
const snap = store.open();
configureFollowupStore(store.followupStore());

const webDist = join(REPO_ROOT, 'apps', 'web', '.next-pilot', 'static');
const problems = startupProblems({
  world: snap.fu.world ?? null,
  env: process.env,
  bundleDirs: process.env.PILOT_SKIP_BUNDLE_CHECK === '1' ? [] : [webDist, cfg.teacherDist],
});
if (problems.length) {
  console.error('pilot: refusing to start. The start-up check found:');
  for (const p of problems) console.error(`  - ${p}`);
  releaseLock(cfg.dataDir);
  process.exit(1);
}

const app = createPilotApp(cfg, store);
const servers: Server[] = [];
const onError = (res: import('node:http').ServerResponse) => (e: unknown) => {
  console.error('pilot: request failed', e);
  if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
  res.end('Something went wrong. Nothing was lost; try again.');
};
const listen = (s: Server, port: number, host: string, label: string) =>
  new Promise<void>((ok, fail) => {
    s.once('error', fail);
    s.listen(port, host, () => {
      console.log(`pilot: ${label}`);
      ok();
    });
    servers.push(s);
  });

const lanTls = cfg.bind !== '127.0.0.1';
if (lanTls && (!existsSync(cfg.tlsCert) || !existsSync(cfg.tlsKey))) {
  console.error(`pilot: no certificate in ${cfg.tlsCert}. Run pnpm pilot:cert first.`);
  releaseLock(cfg.dataDir);
  process.exit(1);
}
const tls = lanTls ? { cert: readFileSync(cfg.tlsCert), key: readFileSync(cfg.tlsKey) } : null;

for (const [surface, port] of [
  ['web', cfg.webPort],
  ['teacher', cfg.teacherPort],
] as const) {
  const handler = (
    req: import('node:http').IncomingMessage,
    res: import('node:http').ServerResponse,
  ) => app.handle(req, res, surface).catch(onError(res));
  if (tls)
    await listen(
      createHttps(tls, handler),
      port,
      cfg.bind,
      `${surface === 'web' ? 'owner web' : 'teacher app'} → https://${cfg.bind}:${port}`,
    );
  if (cfg.localHttp || !tls)
    await listen(
      createHttp(handler),
      port,
      '127.0.0.1',
      `${surface === 'web' ? 'owner web' : 'teacher app'} (this laptop) → http://127.0.0.1:${port}`,
    );
}
console.log(
  `pilot: ${snap.meta.centreName} • data in ${cfg.dataDir} • backups in ${cfg.backupDir}`,
);
console.log(
  cfg.voice && cfg.aiToken
    ? `pilot: voice notes ON for teachers with signed consent → ai-service ${cfg.aiUrl} (this laptop)`
    : 'pilot: voice notes OFF (teachers type the note)',
);

// Hourly backups, and one on every shutdown (A2).
app.runRetention(); // recordings past 30 days or the pilot's end go at once
const hourly = setInterval(() => {
  app.runRetention();
  backup(cfg.dataDir, cfg.backupDir, 'hourly');
}, 3_600_000);
const heartbeat = setInterval(() => refreshLock(cfg.dataDir), LOCK_REFRESH_MS);
let stopping = false;
function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  clearInterval(hourly);
  clearInterval(heartbeat);
  try {
    store.write();
    const to = backup(cfg.dataDir, cfg.backupDir, 'shutdown');
    console.log(`pilot: ${signal} — state saved; backup ${to ?? 'skipped'}.`);
  } finally {
    store.close();
    releaseLock(cfg.dataDir);
    for (const s of servers) s.close();
    process.exit(0);
  }
}
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const)
  process.on(sig, () => stop(sig));
