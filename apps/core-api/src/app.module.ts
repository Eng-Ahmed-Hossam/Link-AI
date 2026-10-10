import { Module, type DynamicModule, type Provider, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AiServiceClient, VOICE_AI, type VoiceAi } from './adapters/ai';
import {
  FakePayProvider,
  NoPaymentProvider,
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from './adapters/payments';
import { AUDIO_STORE, type AudioStore, FileAudioStore, S3AudioStore } from './adapters/storage';
import {
  ManualSender,
  WHATSAPP_SENDER,
  WhatsAppFakeSender,
  type WhatsAppSender,
} from './adapters/whatsapp';
import { Assistant } from './followup/assistant';
import { Cases } from './followup/cases';
import { FollowupController } from './followup/controller';
import { Messages } from './followup/messages';
import { Owner } from './followup/owner';
import { Records } from './followup/records';
import { Voice } from './followup/voice';
import { type SmsSender, SMS_SENDER, SmsSinkSender } from './adapters/sms';
import { type Config } from './config';
import { demoRoutesAllowed } from './platform/guard';
import { Accounts } from './identity/accounts';
import { AuthController } from './identity/auth.controller';
import { MeController } from './identity/me.controller';
import { OtpService } from './identity/otp';
import { Phones } from './identity/phone';
import { Tokens } from './identity/tokens';
import { CentresController } from './org/centres.controller';
import { Children } from './org/children';
import { FieldCipher, LocalKeyWrapper } from './platform/crypto';
import { Database } from './platform/db';
import { CONFIG } from './platform/di';
import { HealthController } from './platform/health.controller';
import { AuthGuard, ContractCheckInterceptor, IdempotencyInterceptor } from './platform/http';
import { LOGGER, type Logger } from './platform/logger';
import { Redises } from './platform/redis';
import { Reference, ReferenceController } from './ref/reference';
import { Groups, GroupsController } from './market/groups';
import { Halls, HallsController } from './market/halls';
import { Requests, RequestsController } from './market/requests';
import { Search, SearchController } from './market/search';
import { Reviews, ReviewsController } from './market/reviews';
import { Enrolments } from './enrolment/enrolments';
import { EnrolmentsController } from './enrolment/enrolments.controller';
import { EnrolmentJobs } from './enrolment/jobs';
import { Seats } from './enrolment/seats';
import { RentInvoices } from './ledger/rent-invoices';
import { Reports } from './ledger/reports';
import { Money } from './payments/money';
import { DataRequests } from './identity/data-requests';
import { OpsConsole } from './ops/console';
import { OpsController } from './ops/ops.controller';

export interface Overrides {
  sms?: SmsSender;
  payments?: PaymentProvider;
  audio?: AudioStore;
  /** null = no ai-service (voice notes answer "Type the note instead"). */
  ai?: VoiceAi | null;
  whatsapp?: WhatsAppSender;
}

/** Shared services, built from the typed config. Used by every entrypoint (api, worker, gateway). */
export function coreProviders(c: Config, log: Logger, overrides: Overrides = {}): Provider[] {
  const factory = <T>(provide: unknown, inject: unknown[], useFactory: (...a: never[]) => T) =>
    ({ provide, inject, useFactory }) as Provider;
  return [
    { provide: CONFIG, useValue: c },
    { provide: LOGGER, useValue: log },
    factory(
      Database,
      [],
      () => new Database(c.DATABASE_URL, c.DATABASE_URL_WORKER, c.DATABASE_URL_OPS),
    ),
    factory(Redises, [], () => new Redises(c.REDIS_STATE_URL, c.REDIS_CACHE_URL, c.APP_ENV)),
    factory(FieldCipher, [], () => {
      // Locally the key comes from .env.local; on a server it is the FIELD_KEY secret (docs/10 §5).
      const key = c.FIELD_KEY_LOCAL ?? c.FIELD_KEY;
      if (!key) throw new Error('Set FIELD_KEY_LOCAL (local) or FIELD_KEY (a server).');
      return new FieldCipher(new LocalKeyWrapper(key));
    }),
    factory(Phones, [FieldCipher], (cipher: FieldCipher) => new Phones(c.HMAC_KEY_LOOKUP, cipher)),
    factory(SMS_SENDER, [], () => overrides.sms ?? new SmsSinkSender(c.SMS_SINK_URL!)),
    factory(
      OtpService,
      [Redises, Phones, SMS_SENDER],
      (r: Redises, p: Phones, sms: SmsSender) => new OtpService(r, p, sms, c.HMAC_KEY_LOOKUP),
    ),
    factory(Tokens, [Database], (db: Database) => new Tokens(c, db)),
    factory(Accounts, [Database, Phones], (db: Database, p: Phones) => new Accounts(db, p)),
    factory(Reference, [Database], (db: Database) => new Reference(db)),
    factory(
      Children,
      [Database, Reference],
      (db: Database, ref: Reference) => new Children(db, ref),
    ),
    factory(Seats, [Redises, Database], (r: Redises, db: Database) => new Seats(r, db)),
    factory(
      PAYMENT_PROVIDER,
      [],
      () =>
        overrides.payments ??
        (c.PAYMENT_PROVIDER === 'none'
          ? new NoPaymentProvider()
          : new FakePayProvider(c.FAKE_PAY_URL!, c.PAYMENT_WEBHOOK_SECRET)),
    ),
    factory(Halls, [Database, Seats], (db: Database, s: Seats) => new Halls(db, s)),
    factory(Requests, [Database], (db: Database) => new Requests(db)),
    factory(
      Groups,
      [Database, Seats, Records],
      (db: Database, s: Seats, r: Records) => new Groups(db, s, r),
    ),
    factory(Search, [Database, Seats], (db: Database, s: Seats) => new Search(db, s)),
    factory(
      Money,
      [Database, Seats, PAYMENT_PROVIDER],
      (db: Database, s: Seats, p: PaymentProvider) => new Money(db, s, p, c, log),
    ),
    factory(
      Enrolments,
      [Database, Seats, Money, PAYMENT_PROVIDER, Search, Children],
      (db: Database, s: Seats, m: Money, p: PaymentProvider, search: Search, ch: Children) =>
        new Enrolments(db, s, m, p, search, ch, c, log),
    ),
    factory(
      EnrolmentJobs,
      [Database, Seats, Money, Enrolments, PAYMENT_PROVIDER],
      (db: Database, s: Seats, m: Money, e: Enrolments, p: PaymentProvider) =>
        new EnrolmentJobs(db, s, m, e, p, log),
    ),
    factory(RentInvoices, [Database], (db: Database) => new RentInvoices(db, log)),
    factory(
      Reports,
      [Database, Seats, Halls],
      (db: Database, s: Seats, h: Halls) => new Reports(db, s, h),
    ),
    factory(Reviews, [Database], (db: Database) => new Reviews(db)),
    // ── R3 follow-up (the paid extra) ───────────────────────────────────────────
    factory(
      AUDIO_STORE,
      [],
      () =>
        overrides.audio ??
        (c.STORAGE_PROVIDER === 'file' ? new FileAudioStore(c) : new S3AudioStore(c)),
    ),
    factory(VOICE_AI, [], () =>
      overrides.ai !== undefined
        ? overrides.ai
        : c.AI_SERVICE_URL && c.AI_SERVICE_TOKEN
          ? new AiServiceClient(
              c.AI_SERVICE_URL,
              c.AI_SERVICE_TOKEN,
              c.AI_SERVICE_ON_THIS_SERVER === '1',
            )
          : null,
    ),
    factory(
      WHATSAPP_SENDER,
      [],
      () =>
        overrides.whatsapp ??
        (c.WHATSAPP_PROVIDER === 'manual'
          ? new ManualSender()
          : new WhatsAppFakeSender(c.WHATSAPP_FAKE_URL, c.WHATSAPP_WEBHOOK_SECRET)),
    ),
    factory(Records, [Database], (db: Database) => new Records(db)),
    factory(
      Voice,
      [Database, AUDIO_STORE, VOICE_AI],
      (db: Database, store: AudioStore, ai: VoiceAi | null) => new Voice(db, store, ai, c, log),
    ),
    factory(Cases, [Database], (db: Database) => new Cases(db)),
    factory(
      Messages,
      [Database, WHATSAPP_SENDER, Phones],
      (db: Database, w: WhatsAppSender, p: Phones) => new Messages(db, w, p, log),
    ),
    factory(Owner, [Database], (db: Database) => new Owner(db)),
    // ── S2 ops console and data-subject requests ───────────────────────────────
    factory(OpsConsole, [Database, Money], (db: Database, m: Money) => new OpsConsole(db, m)),
    factory(DataRequests, [Database], (db: Database) => new DataRequests(db)),
    factory(Assistant, [Cases, Messages], (cs: Cases, m: Messages) => new Assistant(cs, m, c, log)),
  ];
}

/** The HTTP API (entrypoint `api`). Demo controls exist only when APP_ENV=local. */
export async function apiModule(
  c: Config,
  log: Logger,
  overrides: Overrides = {},
): Promise<DynamicModule> {
  const controllers: Type[] = [
    HealthController,
    AuthController,
    MeController,
    ReferenceController,
    CentresController,
    HallsController,
    RequestsController,
    GroupsController,
    SearchController,
    EnrolmentsController,
    ReviewsController,
    FollowupController,
    OpsController,
  ];
  if (demoRoutesAllowed(c)) controllers.push((await import('./dev/dev.controller')).DevController);
  @Module({})
  class ApiModule {}
  return {
    module: ApiModule,
    controllers,
    providers: [
      ...coreProviders(c, log, overrides),
      Reflector,
      AuthGuard,
      IdempotencyInterceptor,
      ContractCheckInterceptor,
    ],
  };
}
