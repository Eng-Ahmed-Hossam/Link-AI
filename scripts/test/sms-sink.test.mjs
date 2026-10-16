// pnpm test:scripts — the hosted staging's private code inbox (Stage 3): with SMS_SINK_TOKEN the
// sms-sink fake answers only with HTTP Basic auth (the token as the password); /health stays open.
import assert from 'node:assert/strict';
import { after, before, it } from 'node:test';

process.env.SMS_SINK_TOKEN = 'sample-sink-token-0123456789';
const { authorised, server } = await import('../../infra/local/fakes/sms-sink/server.mjs');
const basic = (pass) => `Basic ${Buffer.from(`x:${pass}`).toString('base64')}`;
let base;
before(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

it('no token configured: open (local)', () => {
  assert.equal(authorised(undefined, ''), true);
});

it('with a token: only the right Basic password', () => {
  assert.equal(authorised(undefined), false);
  assert.equal(authorised(basic('wrong')), false);
  assert.equal(authorised('Bearer sample-sink-token-0123456789'), false);
  assert.equal(authorised(basic('sample-sink-token-0123456789')), true);
});

it('the server: 401 without the token, codes with it, /health open', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/messages`)).status, 401);
  const post = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: basic('sample-sink-token-0123456789'),
    },
    body: JSON.stringify({ to: '+201000000003', body: 'code 123456', templateCode: 'otp' }),
  });
  assert.equal(post.status, 202);
  const list = await fetch(`${base}/api/messages`, {
    headers: { authorization: basic('sample-sink-token-0123456789') },
  });
  assert.equal((await list.json()).items.length, 1);
});
