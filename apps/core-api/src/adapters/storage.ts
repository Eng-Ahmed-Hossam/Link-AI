import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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
        // Encrypted at rest with the storage key (SSE-KMS); never a public object.
        ServerSideEncryption: 'aws:kms',
        ...(this.c.KMS_KEY_STORAGE ? { SSEKMSKeyId: this.c.KMS_KEY_STORAGE } : {}),
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
