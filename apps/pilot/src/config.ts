/**
 * Pilot configuration, from the environment or `apps/pilot/.env.pilot` (see `.env.pilot.example`).
 * Nothing secret lives here: PIN hashes and sessions are in the state file on the encrypted drive.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

export interface PilotConfig {
  dataDir: string;
  backupDir: string;
  /** The centre LAN address the HTTPS listeners bind to (never 0.0.0.0). */
  bind: string;
  webPort: number;
  teacherPort: number;
  /** Also serve plain HTTP on 127.0.0.1 (same ports) for use on the laptop itself. */
  localHttp: boolean;
  tlsCert: string;
  tlsKey: string;
  sessionHours: number;
  /** The owner web's Next.js production server (pilot build), proxied by this server. */
  webUpstream: string;
  /** The teacher app's static web build (pilot build). */
  teacherDist: string;
  allowedOrigins: string[];
}

/** `apps/pilot/.env.pilot` (git-ignored) holds this laptop's settings; real env vars win. */
export const ENV_FILE = join(REPO_ROOT, 'apps', 'pilot', '.env.pilot');
let loaded = false;
export function loadPilotEnv() {
  if (loaded) return;
  loaded = true;
  if (existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
}

export function pilotConfig(env: NodeJS.ProcessEnv = process.env): PilotConfig {
  if (env === process.env) loadPilotEnv();
  const dataDir = env.PILOT_DATA_DIR;
  if (!dataDir) throw new Error('Set PILOT_DATA_DIR to a folder on the encrypted drive.');
  const bind = env.PILOT_BIND ?? '127.0.0.1';
  if (bind === '0.0.0.0' || bind === '::')
    throw new Error('PILOT_BIND must be the centre LAN address, not every interface.');
  const webPort = Number(env.PILOT_WEB_PORT ?? 8443);
  const teacherPort = Number(env.PILOT_TEACHER_PORT ?? 8444);
  const localHttp = env.PILOT_LOCAL_HTTP !== '0';
  const origins = [
    `https://${bind}:${webPort}`,
    `https://${bind}:${teacherPort}`,
    ...(localHttp
      ? [webPort, teacherPort].flatMap((p) => [`http://127.0.0.1:${p}`, `http://localhost:${p}`])
      : []),
    ...(env.PILOT_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  ];
  return {
    dataDir: resolve(dataDir),
    backupDir: resolve(env.PILOT_BACKUP_DIR ?? join(dataDir, 'backups')),
    bind,
    webPort,
    teacherPort,
    localHttp,
    tlsCert: env.PILOT_TLS_CERT ?? join(dataDir, 'tls', 'server.crt'),
    tlsKey: env.PILOT_TLS_KEY ?? join(dataDir, 'tls', 'server.key'),
    sessionHours: Number(env.PILOT_SESSION_HOURS ?? 12),
    webUpstream: env.PILOT_WEB_UPSTREAM ?? 'http://127.0.0.1:3100',
    teacherDist: env.PILOT_TEACHER_DIST ?? join(REPO_ROOT, 'apps', 'teacher-app', 'dist-pilot'),
    allowedOrigins: [...new Set(origins)],
  };
}
