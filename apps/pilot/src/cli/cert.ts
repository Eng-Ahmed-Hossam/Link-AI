/**
 * `pnpm pilot:cert` — HTTPS on the centre LAN (A4). Browsers only allow the microphone on HTTPS (or
 * localhost), so the teacher phones need a certificate they trust.
 *
 * Creates, in `<PILOT_DATA_DIR>/tls/`:
 *   link-pilot-ca.crt  — the local certificate authority: install THIS on each teacher phone
 *   ca.key             — its private key (stays on the encrypted drive; deleted by pilot:wipe)
 *   server.crt / .key  — the pilot server's certificate for the LAN address, signed by the CA
 * Re-running keeps the CA (phones stay set up) and issues a new server certificate, e.g. after the
 * laptop's LAN address changes. Same job as `mkcert`, without installing a separate tool.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname, networkInterfaces } from 'node:os';
import { join } from 'node:path';
import forge from 'node-forge';
import { config } from './common';

const cfg = config();
const dir = join(cfg.dataDir, 'tls');
mkdirSync(dir, { recursive: true });
const caCrt = join(dir, 'link-pilot-ca.crt');
const caKey = join(dir, 'ca.key');
const { pki, md } = forge;

const serial = () => forge.util.bytesToHex(forge.random.getBytesSync(16)).replace(/^[89a-f]/, '1');
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

let ca: forge.pki.Certificate;
let caPriv: forge.pki.rsa.PrivateKey;
if (existsSync(caCrt) && existsSync(caKey)) {
  ca = pki.certificateFromPem(readFileSync(caCrt, 'utf8'));
  caPriv = pki.privateKeyFromPem(readFileSync(caKey, 'utf8')) as forge.pki.rsa.PrivateKey;
  console.log('Using the existing pilot CA (phones that trust it stay set up).');
} else {
  const keys = pki.rsa.generateKeyPair(2048);
  ca = pki.createCertificate();
  ca.publicKey = keys.publicKey;
  ca.serialNumber = serial();
  ca.validity.notBefore = days(-1);
  ca.validity.notAfter = days(365);
  const name = [
    { name: 'commonName', value: 'Link Pilot CA (local)' },
    { name: 'organizationName', value: 'Link pilot' },
  ];
  ca.setSubject(name);
  ca.setIssuer(name);
  ca.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true, pathLenConstraint: 0 },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true },
    { name: 'subjectKeyIdentifier' },
  ]);
  ca.sign(keys.privateKey, md.sha256.create());
  caPriv = keys.privateKey;
  writeFileSync(caCrt, pki.certificateToPem(ca));
  writeFileSync(caKey, pki.privateKeyToPem(caPriv), { mode: 0o600 });
  console.log('Created a new pilot CA.');
}

// The LAN address(es): PILOT_BIND plus every private IPv4 of this laptop, localhost and the name.
const ips = new Set<string>([cfg.bind, '127.0.0.1']);
for (const list of Object.values(networkInterfaces()))
  for (const a of list ?? [])
    if (
      a.family === 'IPv4' &&
      !a.internal &&
      /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(a.address)
    )
      ips.add(a.address);
// A hostname with characters a certificate cannot carry (e.g. "_") is left out; the IP is enough.
const names = ['localhost', hostname().toLowerCase()].filter((n) =>
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/.test(n),
);

const keys = pki.rsa.generateKeyPair(2048);
const cert = pki.createCertificate();
cert.publicKey = keys.publicKey;
cert.serialNumber = serial();
cert.validity.notBefore = days(-1);
// iOS accepts at most 825 days for a certificate from a locally installed CA; 180 covers the pilot.
cert.validity.notAfter = days(180);
cert.setSubject([{ name: 'commonName', value: cfg.bind }]);
cert.setIssuer(ca.subject.attributes);
cert.setExtensions([
  { name: 'basicConstraints', cA: false },
  { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
  { name: 'extKeyUsage', serverAuth: true },
  {
    name: 'subjectAltName',
    altNames: [
      ...[...ips].map((ip) => ({ type: 7, ip })),
      ...names.map((value) => ({ type: 2, value })),
    ],
  },
  { name: 'subjectKeyIdentifier' },
]);
cert.sign(caPriv, md.sha256.create());
writeFileSync(join(dir, 'server.crt'), pki.certificateToPem(cert) + pki.certificateToPem(ca));
writeFileSync(join(dir, 'server.key'), pki.privateKeyToPem(keys.privateKey), { mode: 0o600 });

console.log(`
✔ Server certificate for: ${[...ips, ...names].join(', ')} (valid 180 days)
  ${join(dir, 'server.crt')}

Install the CA on each teacher phone (docs/pilot/phone-setup.md):
  ${caCrt}
Then open https://${cfg.bind}:${cfg.teacherPort} on the phone.
`);
