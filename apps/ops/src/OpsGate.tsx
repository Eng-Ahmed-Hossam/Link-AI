'use client';

import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, api, opsApi, type OpsMe, type OpsPermission } from '@link/api-client';
import { createTranslator, type Locale } from '@link/i18n';
import { Button, Callout, Card, LoadingState } from '@link/ui';
import { useApiLocale } from './api';
import { useLoad } from './useLoad';

const Ctx = createContext<OpsMe | null>(null);
/** The signed-in ops user and their permissions (OD-37). */
export const useOpsMe = () => useContext(Ctx)!;
export const can = (me: OpsMe, p: OpsPermission) => me.permissions.includes(p);

/**
 * MKT-OPS-08: the console opens only for a `link_ops` user from an allowed network. Signed out →
 * the sign-in page; any other account, or another network, is told so (nothing else loads).
 */
export function OpsGate({ locale, children }: { locale: Locale; children: ReactNode }) {
  useApiLocale(locale);
  const t = createTranslator(locale);
  const router = useRouter();
  const { data, error, loading } = useLoad(() => opsApi.me(), []);
  const signedOut = error?.problem.status === 401;
  useEffect(() => {
    if (signedOut) router.replace(`/${locale}/sign-in`);
  }, [signedOut, router, locale]);

  if (loading || signedOut) return <LoadingState label={t('states.loading.label')} rows={3} />;
  if (error || !data)
    return (
      <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
        <Card padding="lg" className="flex flex-col gap-4" data-testid="ops-refused">
          <Callout tone="error" role="alert">
            {error instanceof ApiError && error.code === 'ops_ip_not_allowed'
              ? t('ops.gate.ipNotAllowed')
              : error instanceof ApiError && error.code === 'ops_permission_required'
                ? t('ops.gate.notOps')
                : t('states.error.body')}
          </Callout>
          <Button
            variant="secondary"
            onClick={() => void api.logout().finally(() => router.replace(`/${locale}/sign-in`))}
          >
            {t('ops.shell.signOut')}
          </Button>
        </Card>
      </main>
    );
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}
