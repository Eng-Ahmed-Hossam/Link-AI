import { z } from 'zod';

/**
 * Typed configuration (docs/14 §3). Read once at start-up; a missing or malformed value stops the
 * process with the variable's name, never its value.
 */
const base64Key = (minBytes: number) =>
  z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length >= minBytes,
      `needs ${minBytes}+ bytes (base64)`,
    );

const schema = z
  .object({
    APP_ENV: z.enum(['local', 'dev', 'staging', 'prod']),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    CORE_API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    DATABASE_URL_WORKER: z.string().url(),
    REDIS_CACHE_URL: z.string().url(),
    REDIS_STATE_URL: z.string().url(),
    HMAC_KEY_LOOKUP: z.string().min(32),
    FIELD_KEY_LOCAL: base64Key(32).optional(),
    KMS_KEY_FIELDS: z.string().optional(),
    JWT_ISSUER: z.string().min(1),
    JWT_AUDIENCE: z.string().min(1),
    JWT_SIGNING_KEY_ID: z.string().min(1),
    JWT_SIGNING_KEY: base64Key(32),
    ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
    CORS_ALLOWED_ORIGINS: z.string().default(''),
    SMS_PROVIDER: z.enum(['fake']).default('fake'),
    SMS_SINK_URL: z.string().url().optional(),
    SMS_SENDER_ID: z.string().default('Link'),
    QUEUE_PROVIDER: z.enum(['sqs']).default('sqs'),
    AWS_ENDPOINT_URL: z.string().url().optional(),
    S3_REGION: z.string().default('eu-central-1'),
    EVENTS_TOPIC: z.string().min(1),
    QUEUE_NOTIFICATIONS: z.string().min(1),
    DLQ_NOTIFICATIONS: z.string().min(1),
    // Payments (docs/08): the local fake provider until a real one is chosen (OD-46).
    PAYMENT_PROVIDER: z.enum(['fake']).default('fake'),
    PAYMENT_WEBHOOK_SECRET: z.string().min(16),
    FAKE_PAY_URL: z.string().url().optional(),
    /** The web app's public address: where the hosted checkout sends the parent back. */
    NEXT_PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
    /** Seat holds (BR-ENR-01, OD-09): 10 minutes for card and wallet, 24 hours for Fawry. */
    HOLD_SECONDS: z.coerce.number().int().positive().default(600),
    FAWRY_HOLD_SECONDS: z.coerce.number().int().positive().default(86_400),
    // R3 follow-up: consumer queues, voice storage, ai-service and the WhatsApp provider.
    QUEUE_VOICE: z.string().min(1).default('link-local-voice'),
    DLQ_VOICE: z.string().min(1).default('link-local-voice-dlq'),
    QUEUE_MESSAGING: z.string().min(1).default('link-local-messaging'),
    DLQ_MESSAGING: z.string().min(1).default('link-local-messaging-dlq'),
    QUEUE_FOLLOWUP: z.string().min(1).default('link-local-followup'),
    DLQ_FOLLOWUP: z.string().min(1).default('link-local-followup-dlq'),
    S3_ENDPOINT: z.string().url().optional(),
    S3_BUCKET_VOICE: z.string().min(1).default('link-local-voice'),
    KMS_KEY_STORAGE: z.string().optional(),
    /** ai-service (local Whisper + Ollama). Unset: voice notes answer "Type the note instead". */
    AI_SERVICE_URL: z.string().url().optional(),
    AI_SERVICE_TOKEN: z.string().optional(),
    /** Ask Link in live mode only with a local LLM (R3.4): the scripted assistant never runs here. */
    OLLAMA_URL: z.string().url().optional(),
    WHATSAPP_PROVIDER: z.enum(['fake', 'manual']).default('fake'),
    WHATSAPP_FAKE_URL: z.string().url().default('http://localhost:8094'),
    WHATSAPP_WEBHOOK_SECRET: z.string().min(16).default('local-whatsapp-fake-secret'),
    GATEWAY_PORT: z.coerce.number().int().positive().default(4002),
  })
  .superRefine((c, ctx) => {
    // Local only: the key-encryption key comes from .env.local (docs/10 §5); elsewhere KMS.
    if (c.APP_ENV === 'local' && !c.FIELD_KEY_LOCAL)
      ctx.addIssue({
        code: 'custom',
        path: ['FIELD_KEY_LOCAL'],
        message: 'required when APP_ENV=local',
      });
    if (c.APP_ENV !== 'local' && c.FIELD_KEY_LOCAL)
      ctx.addIssue({ code: 'custom', path: ['FIELD_KEY_LOCAL'], message: 'local only' });
    if (c.SMS_PROVIDER === 'fake' && !c.SMS_SINK_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_SINK_URL'],
        message: 'required with SMS_PROVIDER=fake',
      });
    if (c.SMS_PROVIDER === 'fake' && c.APP_ENV === 'prod')
      ctx.addIssue({ code: 'custom', path: ['SMS_PROVIDER'], message: 'fake is refused in prod' });
    if (c.PAYMENT_PROVIDER === 'fake' && c.APP_ENV === 'prod')
      ctx.addIssue({
        code: 'custom',
        path: ['PAYMENT_PROVIDER'],
        message: 'fake is refused in prod',
      });
    if (c.WHATSAPP_PROVIDER === 'fake' && c.APP_ENV === 'prod')
      ctx.addIssue({
        code: 'custom',
        path: ['WHATSAPP_PROVIDER'],
        message: 'fake is refused in prod',
      });
    if (c.PAYMENT_PROVIDER === 'fake' && !c.FAKE_PAY_URL)
      ctx.addIssue({
        code: 'custom',
        path: ['FAKE_PAY_URL'],
        message: 'required with PAYMENT_PROVIDER=fake',
      });
  });

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = schema.safeParse(env);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`core-api configuration is invalid:\n${lines.join('\n')}`);
  }
  return r.data;
}

/** True only for a developer machine: dev-only routes and sample data are allowed. */
export const isLocal = (c: Config) => c.APP_ENV === 'local';
