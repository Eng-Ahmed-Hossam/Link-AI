import { createHash } from 'node:crypto';

/** Deterministic UUID for a fixture ID (v4 layout; sample data only). */
export function demoId(key: string) {
  const h = createHash('sha256').update(`link-demo:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${'89ab'[parseInt(h[16]!, 16) % 4]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
