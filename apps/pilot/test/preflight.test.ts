// 4.1 pnpm pilot:preflight: each check gives ✅/❌ with a one-line fix in Arabic and English.
import forge from 'node-forge';
import { describe, expect, it } from 'vitest';
import * as pf from '../src/preflight';

function certFor(ip: string, days: number): string {
  const { pki } = forge;
  const keys = pki.rsa.generateKeyPair(1024);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + days * 86_400_000);
  const attrs = [{ name: 'commonName', value: 'Link pilot' }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'subjectAltName', altNames: [{ type: 7, ip }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return pki.certificateToPem(cert);
}

describe('4.1 pilot:preflight checks', () => {
  it('every check carries a title and a one-line fix in both languages', () => {
    const all = [
      ...pf.versions({ node: 'v20.1.0', pnpm: null, uv: null, python: null, voice: true }),
      pf.disk(0),
      pf.encryption(2, 'C:'),
      pf.timeZone('UTC'),
      pf.certificate(null, '192.168.1.15'),
      pf.ports({ running: false, busy: [8443] }),
      pf.lan('192.168.1.15', []),
      pf.backups({ writable: true, newest: null }),
      pf.noDemo(['Demo code in the app bundle']),
      ...pf.voiceModels({
        whisper: 'large-v3-turbo',
        whisperOk: false,
        llm: 'qwen3:4b',
        llmOk: false,
      }),
      pf.voiceTrial({ profile: 'cpu_rules', audioS: 5, sttS: 0, totalS: 0, chars: 0 }),
    ];
    expect(all.every((c) => !c.ok)).toBe(true);
    for (const c of all) {
      expect(c.title.ar && c.title.en && c.fix.ar && c.fix.en).toBeTruthy();
      expect(c.fix.ar.includes('\n') || c.fix.en.includes('\n')).toBe(false); // one line
      expect(/[؀-ۿ]/.test(c.fix.ar)).toBe(true); // the Arabic fix is Arabic
    }
    const text = pf.render(all);
    expect(text).toContain('❌');
    expect(text).toContain('بند يحتاج إصلاحًا');
  });

  it('versions: Node 24+ and pnpm 12+; Python 3.12 and uv only when voice is on', () => {
    const ok = pf.versions({
      node: 'v24.3.0',
      pnpm: '12.8.1',
      uv: null,
      python: null,
      voice: false,
    });
    expect(ok.map((c) => c.id)).toEqual(['node', 'pnpm']);
    expect(ok.every((c) => c.ok)).toBe(true);
    const v = pf.versions({
      node: 'v24.3.0',
      pnpm: '12.8.1',
      uv: 'uv 0.11.19',
      python: '3.12.10',
      voice: true,
    });
    expect(v.every((c) => c.ok)).toBe(true);
    expect(
      pf.versions({ node: 'v24', pnpm: '12', uv: 'uv', python: '3.13.0', voice: true }).at(-1)!.ok,
    ).toBe(false);
  });

  it('encryption: on (1, 6) passes; off, encrypting or unknown fails with the right fix', () => {
    expect(pf.encryption(1, 'C:').ok).toBe(true);
    expect(pf.encryption(6, 'D:').ok).toBe(true);
    expect(pf.encryption(2, 'C:').ok).toBe(false);
    expect(pf.encryption(3, 'C:').fix.en).toMatch(/still running/);
    expect(pf.encryption(null, 'C:').ok).toBe(false);
  });

  it('time zone must be Africa/Cairo', () => {
    expect(pf.timeZone('Africa/Cairo').ok).toBe(true);
    expect(pf.timeZone('Europe/London').ok).toBe(false);
  });

  it('certificate: valid for 7+ days and naming the LAN address', () => {
    const pem = certFor('192.168.1.15', 180);
    expect(pf.certificate(pem, '192.168.1.15').ok).toBe(true);
    const moved = pf.certificate(pem, '192.168.1.20');
    expect(moved.ok).toBe(false);
    expect(moved.detail).toMatch(/not in the certificate/);
    expect(pf.certificate(certFor('192.168.1.15', 3), '192.168.1.15').ok).toBe(false);
    expect(pf.certificate('garbage', '192.168.1.15').ok).toBe(false);
  });

  it('ports: free, or already held by the running pilot', () => {
    expect(pf.ports({ running: false, busy: [] }).ok).toBe(true);
    expect(pf.ports({ running: true, busy: [] }).ok).toBe(true);
    expect(pf.ports({ running: false, busy: [8444] }).fix.en).toContain('8444');
  });

  it('LAN: a private address on this laptop; never 0.0.0.0, a public or a link-local one', () => {
    expect(pf.lan('192.168.1.15', ['192.168.1.15']).ok).toBe(true);
    expect(pf.lan('10.0.0.5', ['10.0.0.5']).ok).toBe(true);
    expect(pf.lan('192.168.1.15', ['192.168.1.30']).ok).toBe(false); // the router gave a new one
    expect(pf.lan('169.254.3.4', ['169.254.3.4']).ok).toBe(false);
    expect(pf.lan('8.8.8.8', ['8.8.8.8']).ok).toBe(false);
    expect(pf.lan('192.168.1.15', []).fix.en).toMatch(/guest Wi-Fi/);
  });

  it('backups: writable, and the last one under 2 hours old', () => {
    const now = new Date('2026-10-10T08:00:00Z');
    expect(pf.backups({ writable: true, newest: new Date('2026-10-10T07:00:00Z'), now }).ok).toBe(
      true,
    );
    expect(pf.backups({ writable: true, newest: new Date('2026-10-10T05:00:00Z'), now }).ok).toBe(
      false,
    );
    expect(pf.backups({ writable: false, newest: new Date(), now }).fix.en).toMatch(/Cannot write/);
  });

  it('voice trial: projects a 1-minute note from the 5-second clip against the profile', () => {
    // CPU, rules only: 5 s clip in 3.5 s of speech-to-text → about 42 s per minute (budget 40 × 1.5).
    expect(
      pf.voiceTrial({ profile: 'cpu_rules', audioS: 5, sttS: 3.5, totalS: 3.6, chars: 30 }).ok,
    ).toBe(true);
    // Far too slow for the GPU profile.
    expect(pf.voiceTrial({ profile: 'gpu', audioS: 5, sttS: 3.5, totalS: 3.6, chars: 30 }).ok).toBe(
      false,
    );
    // The LLM step is added once, not scaled with the audio.
    const llm = pf.voiceTrial({ profile: 'cpu_llm', audioS: 5, sttS: 3, totalS: 60, chars: 30 });
    expect(llm.detail).toMatch(/about 93 s/);
    expect(llm.ok).toBe(true);
  });
});
