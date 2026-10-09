import { Module, type DynamicModule, type Provider, type Type } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type SmsSender, SMS_SENDER, SmsSinkSender } from './adapters/sms';
import { type Config, isLocal } from './config';
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

/** Shared services, built from the typed config. Used by every entrypoint (api, worker, gateway). */
export function coreProviders(
  c: Config,
  log: Logger,
  overrides: { sms?: SmsSender } = {},
): Provider[] {
  const factory = <T>(provide: unknown, inject: unknown[], useFactory: (...a: never[]) => T) =>
    ({ provide, inject, useFactory }) as Provider;
  return [
    { provide: CONFIG, useValue: c },
    { provide: LOGGER, useValue: log },
    factory(Database, [], () => new Database(c.DATABASE_URL, c.DATABASE_URL_WORKER)),
    factory(Redises, [], () => new Redises(c.REDIS_STATE_URL, c.REDIS_CACHE_URL, c.APP_ENV)),
    factory(FieldCipher, [], () => {
      if (!c.FIELD_KEY_LOCAL)
        throw new Error(
          'Field encryption with KMS arrives with deployment; set FIELD_KEY_LOCAL locally.',
        );
      return new FieldCipher(new LocalKeyWrapper(c.FIELD_KEY_LOCAL));
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
    factory(Halls, [Database], (db: Database) => new Halls(db)),
    factory(Requests, [Database], (db: Database) => new Requests(db)),
    factory(Groups, [Database], (db: Database) => new Groups(db)),
    factory(Search, [Database], (db: Database) => new Search(db)),
  ];
}

/** The HTTP API (entrypoint `api`). Demo controls exist only when APP_ENV=local. */
export async function apiModule(
  c: Config,
  log: Logger,
  overrides: { sms?: SmsSender } = {},
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
  ];
  if (isLocal(c)) controllers.push((await import('./dev/dev.controller')).DevController);
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
