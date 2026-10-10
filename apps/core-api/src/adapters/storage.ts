import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { Config } from '../config';

/**
 * Object storage for voice audio (docs/10 §5): S3 with SSE-KMS — aws-local (Moto) locally. Objects
 * are private; the app reaches them by key only. Behind an interface so the tests can use memory.
 */
export interface AudioStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
export const AUDIO_STORE = Symbol('AUDIO_STORE');

export class S3AudioStore implements AudioStore {
  private readonly s3: S3Client;
  constructor(private readonly c: Config) {
    this.s3 = new S3Client({
      region: c.S3_REGION,
      forcePathStyle: true,
      ...(c.S3_ENDPOINT ? { endpoint: c.S3_ENDPOINT } : {}),
    });
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.c.S3_BUCKET_VOICE,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        // Encrypted at rest (SSE-KMS by default); never a public object. S3_SSE=none for stores
        // that encrypt everything themselves and reject the header (R2).
        ...(this.c.S3_SSE === 'kms'
          ? {
              ServerSideEncryption: 'aws:kms' as const,
              ...(this.c.KMS_KEY_STORAGE ? { SSEKMSKeyId: this.c.KMS_KEY_STORAGE } : {}),
            }
          : this.c.S3_SSE === 'aes256'
            ? { ServerSideEncryption: 'AES256' as const }
            : {}),
      }),
    );
  }

  async get(key: string) {
    try {
      const r = await this.s3.send(
        new GetObjectCommand({ Bucket: this.c.S3_BUCKET_VOICE, Key: key }),
      );
      const bytes = await r.Body!.transformToByteArray();
      return { bytes, contentType: r.ContentType ?? 'application/octet-stream' };
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') return null;
      throw e;
    }
  }

  async delete(key: string) {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.c.S3_BUCKET_VOICE, Key: key }));
  }
}

/** Tests: audio in memory (never written to disk). */
export class MemoryAudioStore implements AudioStore {
  readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  async put(key: string, bytes: Uint8Array, contentType: string) {
    this.objects.set(key, { bytes, contentType });
  }
  async get(key: string) {
    return this.objects.get(key) ?? null;
  }
  async delete(key: string) {
    this.objects.delete(key);
  }
}

/**
 * STORAGE_PROVIDER=file (one server): each object is a file under FILE_STORAGE_DIR, encrypted with
 * AES-256-GCM under STORAGE_KEY (docs/10 §5: encrypted at rest). File names are a hash of the key,
 * so nothing about a person shows in a path. Layout: [1 version][12 IV][16 tag][type length][type]
 * [ciphertext].
 */
export class FileAudioStore implements AudioStore {
  private readonly dir: string;
  private readonly key: Buffer;
  constructor(c: Config) {
    this.dir = resolve(c.FILE_STORAGE_DIR);
    this.key = Buffer.from(c.STORAGE_KEY ?? '', 'base64').subarray(0, 32);
    if (this.key.length !== 32) throw new Error('STORAGE_KEY must be 32 bytes (base64)');
  }

  private path(key: string) {
    const h = createHash('sha256').update(key).digest('hex');
    return join(this.dir, h.slice(0, 2), h);
  }

  async put(key: string, bytes: Uint8Array, contentType: string) {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([c.update(bytes), c.final()]);
    const type = Buffer.from(contentType, 'utf8');
    const p = this.path(key);
    await mkdir(dirname(p), { recursive: true, mode: 0o700 });
    await writeFile(
      p,
      Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), Buffer.from([type.length]), type, body]),
      { mode: 0o600 },
    );
  }

  async get(key: string) {
    let raw: Buffer;
    try {
      raw = await readFile(this.path(key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
    const iv = raw.subarray(1, 13);
    const tag = raw.subarray(13, 29);
    const tlen = raw[29]!;
    const contentType = raw.subarray(30, 30 + tlen).toString('utf8');
    const d = createDecipheriv('aes-256-gcm', this.key, iv);
    d.setAuthTag(tag);
    const bytes = Buffer.concat([d.update(raw.subarray(30 + tlen)), d.final()]);
    return { bytes: new Uint8Array(bytes), contentType };
  }

  async delete(key: string) {
    await rm(this.path(key), { force: true });
  }
}
