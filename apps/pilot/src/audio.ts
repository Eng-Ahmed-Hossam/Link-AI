/**
 * Voice audio on the pilot laptop (B3, CLAUDE.md "voice audio is encrypted and deleted after 30
 * days"): each recording is encrypted with AES-256-GCM under a key kept in the data folder (itself
 * on the BitLocker drive), and deleted 30 days after upload or at the end of the pilot, if sooner.
 * The audio never leaves the laptop: ai-service runs here too (OD-51).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from './store';

export const AUDIO_RETENTION_DAYS = 30;

export interface AudioEntry {
  file: string;
  mime: string;
  bytes: number;
  uploadedAt: string;
  teacherId: string;
  deletedAt: string | null;
}

export class AudioVault {
  private key: Buffer | null = null;
  constructor(private readonly dataDir: string) {}

  private get dir() {
    return join(this.dataDir, 'audio');
  }

  private keyBytes(): Buffer {
    if (this.key) return this.key;
    const f = join(this.dataDir, 'keys', 'audio.key');
    if (!existsSync(f)) {
      mkdirSync(join(this.dataDir, 'keys'), { recursive: true });
      writeAtomic(f, randomBytes(32).toString('base64'));
    }
    this.key = Buffer.from(readFileSync(f, 'utf8'), 'base64');
    return this.key;
  }

  /** Encrypt and store; returns the file name (relative to the audio folder). */
  put(voiceId: string, bytes: Uint8Array): string {
    mkdirSync(this.dir, { recursive: true });
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.keyBytes(), iv);
    c.setAAD(Buffer.from(voiceId));
    const body = Buffer.concat([c.update(bytes), c.final()]);
    const name = `${voiceId}.bin`;
    writeFileSync(join(this.dir, name), Buffer.concat([iv, c.getAuthTag(), body]));
    return name;
  }

  get(voiceId: string, file: string): Uint8Array | null {
    const p = join(this.dir, file);
    if (!existsSync(p)) return null;
    const raw = readFileSync(p);
    const d = createDecipheriv('aes-256-gcm', this.keyBytes(), raw.subarray(0, 12));
    d.setAAD(Buffer.from(voiceId));
    d.setAuthTag(raw.subarray(12, 28));
    return new Uint8Array(Buffer.concat([d.update(raw.subarray(28)), d.final()]));
  }

  delete(file: string) {
    rmSync(join(this.dir, file), { force: true });
  }
}

/** When a recording must be gone: 30 days after upload, or the end of the pilot day, if sooner. */
export function deleteAfter(uploadedAt: string, pilotEnd: string | null): Date {
  const thirty = new Date(new Date(uploadedAt).getTime() + AUDIO_RETENTION_DAYS * 86_400_000);
  if (!pilotEnd) return thirty;
  // The end date is a Cairo calendar day: the audio goes at the end of it (23:59 Cairo ≈ 21:59 UTC).
  const end = new Date(`${pilotEnd}T21:59:59.000Z`);
  return end < thirty ? end : thirty;
}

/** Delete every recording past its date. Returns the voice ids deleted now. */
export function purgeAudio(
  entries: Record<string, AudioEntry>,
  vault: AudioVault,
  pilotEnd: string | null,
  now = new Date(),
): string[] {
  const gone: string[] = [];
  for (const [id, e] of Object.entries(entries)) {
    if (e.deletedAt) continue;
    if (now >= deleteAfter(e.uploadedAt, pilotEnd)) {
      vault.delete(e.file);
      e.deletedAt = now.toISOString();
      gone.push(id);
    }
  }
  return gone;
}
