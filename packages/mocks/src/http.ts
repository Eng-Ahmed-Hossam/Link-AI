import { HttpResponse, delay, type HttpResponseResolver } from 'msw';
import * as db from './db';

export const langOf = (req: Request): db.Lang =>
  req.headers.get('accept-language')?.startsWith('en') ? 'en' : 'ar';

export const problem = (
  status: number,
  code: string,
  detail: string,
  extra: Record<string, unknown> = {},
) =>
  HttpResponse.json(
    {
      type: `https://docs.link.eg/errors/${code.replace(/_/g, '-')}`,
      title: detail,
      status,
      code,
      detail,
      requestId: `req_mock_${Date.now()}`,
      ...extra,
    },
    { status, headers: { 'content-type': 'application/problem+json' } },
  );

/** Mock bearer tokens look like `mock.<userId>` — dev only, never valid against core-api. */
export const userIdOf = (req: Request) => {
  const h = req.headers.get('authorization');
  return h?.startsWith('Bearer mock.') ? h.slice('Bearer mock.'.length) : null;
};

/** Wrap a resolver with the dev-panel scenario (empty / error / offline / slow) for read endpoints. */
export const withScenario =
  (resolver: HttpResponseResolver, empty: () => unknown): HttpResponseResolver =>
  async (info) => {
    const sc = db.mockSettings().scenario;
    if (sc === 'offline') return HttpResponse.error();
    if (sc === 'error')
      return problem(503, 'service_unavailable', 'The service is not responding.');
    if (sc === 'slow') await delay(4000);
    else await delay(250);
    if (sc === 'empty') return HttpResponse.json(empty() as Record<string, unknown>);
    return resolver(info);
  };

export const authed =
  (
    resolver: (args: {
      request: Request;
      params: Record<string, string>;
      userId: string;
      lang: db.Lang;
    }) => Promise<Response> | Response,
  ): HttpResponseResolver =>
  async ({ request, params }) => {
    const userId = userIdOf(request);
    if (!userId) return problem(401, 'unauthenticated', 'Sign in to continue.');
    try {
      return await resolver({
        request,
        params: params as Record<string, string>,
        userId,
        lang: langOf(request),
      });
    } catch (e) {
      if (e instanceof db.MockProblem) return problem(e.status, e.code, e.detail, e.extra);
      throw e;
    }
  };
