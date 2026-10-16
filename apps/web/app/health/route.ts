/**
 * GET /health — the web app answers, and names the commit it was built from (Vercel sets
 * VERCEL_GIT_COMMIT_SHA), so pnpm smoke:deployed can confirm the new version is live.
 */
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    {
      status: 'ok',
      app: 'web',
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.COMMIT_SHA ?? 'unknown',
      env: process.env.NEXT_PUBLIC_APP_ENV ?? 'unset',
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
