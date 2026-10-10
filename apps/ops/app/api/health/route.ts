/** GET /api/health — the ops console server is up (deploy/ health checks). No data, never cached. */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
}
