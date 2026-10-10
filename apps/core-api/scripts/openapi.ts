// pnpm openapi:generate | openapi:check — the OpenAPI 3.1 document is generated from the route
// registry (src/contract), and `packages/api-client/src/generated/openapi.ts` from the document.
// `--check` regenerates in memory and fails when either committed file differs (CI, 07 intro).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import openapiTS, { astToString } from 'openapi-typescript';
import { allRoutes, type RouteDef } from '../src/contract/routes';
import { ProblemDetails } from '../src/contract/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = join(here, '..', 'openapi.json');
const TYPES = join(
  here,
  '..',
  '..',
  '..',
  'packages',
  'api-client',
  'src',
  'generated',
  'openapi.ts',
);
const COMPONENT = '#/components/schemas/';

type Json = Record<string, unknown>;

/** JSON Schema for one route schema: a `$ref` when it is a named component, inline otherwise. */
function schemaOf(s: z.ZodType): Json {
  const id = z.globalRegistry.get(s)?.id;
  if (id) return { $ref: `${COMPONENT}${id}` };
  const out = z.toJSONSchema(s, {
    metadata: z.globalRegistry,
    io: 'input',
    unrepresentable: 'any',
  }) as Json;
  delete out.$schema;
  delete out.$defs;
  return JSON.parse(JSON.stringify(out).replaceAll('"#/$defs/', `"${COMPONENT}`)) as Json;
}

function parameters(r: RouteDef): Json[] {
  const out: Json[] = [];
  for (const [where, obj] of [
    ['path', r.params],
    ['query', r.query],
  ] as const) {
    if (!obj) continue;
    for (const [name, field] of Object.entries(obj.shape)) {
      const f = field as z.ZodType;
      out.push({
        name,
        in: where,
        required: where === 'path' || !f.safeParse(undefined).success,
        schema: schemaOf(f),
      });
    }
  }
  if (r.idempotent)
    out.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      description:
        'A UUID per action; a retry with the same key and body replays the first response (07 §1)',
      schema: { type: 'string', minLength: 8, maxLength: 255 },
    });
  return out;
}

function operation(r: RouteDef): Json {
  const ok = String(r.status ?? (r.response === null ? 204 : 200));
  const problem = {
    'application/problem+json': { schema: { $ref: `${COMPONENT}ProblemDetails` } },
  };
  const responses: Json = {
    [ok]:
      r.response === null
        ? { description: 'No content' }
        : { description: 'OK', content: { 'application/json': { schema: schemaOf(r.response) } } },
  };
  const byStatus = new Map<number, string[]>();
  const errors = [...(r.errors ?? [])];
  if (r.body || r.query || r.params) errors.push({ status: 422, code: 'validation_failed' });
  if (r.auth === 'user') errors.push({ status: 401, code: 'unauthenticated' });
  if (r.params) errors.push({ status: 404, code: 'not_found' });
  if (r.idempotent) errors.push({ status: 422, code: 'idempotency_key_reused' });
  for (const e of errors) byStatus.set(e.status, [...(byStatus.get(e.status) ?? []), e.code]);
  for (const [status, codes] of [...byStatus].sort(([a], [b]) => a - b))
    responses[String(status)] = {
      description: [...new Set(codes)].map((c) => `\`${c}\``).join(', '),
      content: problem,
    };
  return {
    operationId: r.name,
    summary: r.summary,
    tags: [r.tag],
    'x-rules': r.rules,
    ...(r.ops ? { 'x-ops-permission': r.ops } : {}),
    ...(r.auth === 'user' ? { security: [{ bearer: [] }, { cookie: [] }] } : { security: [] }),
    ...(parameters(r).length ? { parameters: parameters(r) } : {}),
    ...(r.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: schemaOf(r.body) } },
          },
        }
      : {}),
    responses,
  };
}

export function buildSpec(): Json {
  void ProblemDetails; // registered component
  const { schemas } = z.toJSONSchema(z.globalRegistry, {
    uri: (id) => `${COMPONENT}${id}`,
    io: 'input',
    unrepresentable: 'any',
  }) as { schemas: Record<string, Json> };
  for (const s of Object.values(schemas)) {
    delete s.$schema;
    delete s.$id;
  }
  const paths: Record<string, Json> = {};
  for (const r of [...allRoutes].sort((a, b) => a.path.localeCompare(b.path)))
    (paths[r.path] ??= {})[r.method] = operation(r);
  return {
    openapi: '3.1.0',
    info: {
      title: 'Link core-api',
      version: '1.0.0',
      description:
        'Generated from apps/core-api/src/contract — do not edit. Conventions: docs/07-api.md §1.',
    },
    servers: [{ url: 'http://localhost:4000', description: 'local' }],
    paths,
    components: {
      schemas: Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))),
      securitySchemes: {
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Teacher app' },
        cookie: {
          type: 'apiKey',
          in: 'cookie',
          name: 'link_at',
          description: 'Web: httpOnly cookie, with the header X-Link-Auth: cookie',
        },
      },
    },
  };
}

async function main() {
  const spec = `${JSON.stringify(buildSpec(), null, 2)}\n`;
  const ast = await openapiTS(JSON.parse(spec), { alphabetize: true });
  const types = `/* Generated by \`pnpm openapi:generate\` from apps/core-api/openapi.json — do not edit. */\n${astToString(ast)}`;
  if (process.argv.includes('--check')) {
    const read = (p: string) => {
      try {
        return readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      } catch {
        return '';
      }
    };
    const drift = [
      read(SPEC) !== spec && 'apps/core-api/openapi.json',
      read(TYPES) !== types && 'packages/api-client/src/generated/openapi.ts',
    ].filter(Boolean);
    if (drift.length) {
      console.error(`✖ OpenAPI drift: ${drift.join(', ')}. Run pnpm openapi:generate and commit.`);
      process.exit(1);
    }
    console.log('✔ OpenAPI document and generated client types match the code.');
    return;
  }
  mkdirSync(dirname(TYPES), { recursive: true });
  writeFileSync(SPEC, spec);
  writeFileSync(TYPES, types);
  console.log(`✔ Wrote ${allRoutes.length} operations to openapi.json and the api-client types.`);
}

await main();
