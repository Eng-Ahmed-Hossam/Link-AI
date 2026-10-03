// pnpm dev:infra — start the local services (docs/14 §2) and wait until every one is healthy.
import { spawnSync } from 'node:child_process';
import { loadEnv, run, compose, fail } from './lib/env.mjs';

loadEnv();

const probe = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], { encoding: 'utf8' });
if (probe.status !== 0) {
  fail('Docker is not running. Start Docker Desktop (WSL2 backend) and try again.');
}

const start = Date.now();
run('docker', compose('up', '-d', '--build', '--wait', '--wait-timeout', '180'));
run('docker', compose('ps', '--format', 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'));
console.log(`\n✔ Local services healthy in ${((Date.now() - start) / 1000).toFixed(0)} s.`);
console.log('  Next: pnpm db:migrate && pnpm db:seed');
