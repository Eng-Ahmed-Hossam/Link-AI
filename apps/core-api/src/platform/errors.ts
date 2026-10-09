/**
 * Optional error tracking (ship job S1, docs/operations.md). Off unless SENTRY_DSN is set; then
 * every error-level log line is sent to that Sentry-compatible endpoint with its plain HTTP API
 * (no SDK). What is sent: the service, the message, the error's type, message and stack, and a few
 * known safe fields (path, job, consumer, entry). Never a request body, a person's data or a token
 * (docs/10 §7) — the same rule as the logs, which are redacted at the source.
 */
const SAFE_FIELDS = ['path', 'method', 'job', 'consumer', 'entry', 'eventId', 'requestId'] as const;

interface Dsn {
  url: string;
  key: string;
}

export function parseDsn(dsn: string | undefined): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+/, '');
    if (!u.username || !project) return null;
    return { url: `${u.protocol}//${u.host}/api/${project}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<unknown>;

export function errorReporter(
  service: string,
  env: NodeJS.ProcessEnv = process.env,
  send: Fetch = (u, i) => fetch(u, i),
) {
  const dsn = parseDsn(env.SENTRY_DSN);
  if (!dsn) return null;
  const environment = env.LINK_ENV ?? env.APP_ENV ?? 'development';
  return (obj: Record<string, unknown>, msg: string) => {
    const err = obj.err as { name?: string; message?: string; stack?: string } | undefined;
    const extra = Object.fromEntries(
      SAFE_FIELDS.filter((k) => obj[k] !== undefined).map((k) => [k, String(obj[k])]),
    );
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: 'node',
      level: 'error',
      environment,
      server_name: service,
      message: msg,
      tags: { service },
      extra,
      ...(err?.message
        ? {
            exception: {
              values: [{ type: err.name ?? 'Error', value: err.message, stacktrace: undefined }],
            },
            extra: { ...extra, stack: err.stack?.split('\n').slice(0, 20).join('\n') },
          }
        : {}),
    };
    const body = [
      JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify(event),
    ].join('\n');
    void Promise.resolve(
      send(dsn.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-sentry-envelope',
          'x-sentry-auth': `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=link-core-api/1`,
        },
        body,
        signal: AbortSignal.timeout(5000),
      }),
    ).catch(() => {});
  };
}
