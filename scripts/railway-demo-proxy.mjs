import { createServer, request } from 'node:http';

const port = Number(process.env.PORT ?? 4000);
const apiPort = Number(process.env.CORE_API_UPSTREAM_PORT ?? 4001);
const demoPort = Number(process.env.MOCK_SERVER_PORT ?? 4010);

const server = createServer((incoming, outgoing) => {
  const url = incoming.url ?? '/';
  const demo = url === '/demo' || url.startsWith('/demo/');
  const targetPort = demo ? demoPort : apiPort;
  const path = demo ? url.slice('/demo'.length) || '/' : url;
  const headers = { ...incoming.headers, host: `127.0.0.1:${targetPort}` };
  const upstream = request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      method: incoming.method,
      path,
      headers,
    },
    (response) => {
      outgoing.writeHead(response.statusCode ?? 502, response.headers);
      response.pipe(outgoing);
    },
  );
  upstream.on('error', (error) => {
    console.error('railway demo proxy upstream error', {
      target: demo ? 'demo' : 'core-api',
      message: error.message,
    });
    if (!outgoing.headersSent)
      outgoing.writeHead(502, { 'content-type': 'application/problem+json' });
    outgoing.end(JSON.stringify({ status: 502, code: 'upstream_unavailable' }));
  });
  incoming.pipe(upstream);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`railway demo proxy listening on ${port}; core-api=${apiPort}, demo=${demoPort}`);
});
