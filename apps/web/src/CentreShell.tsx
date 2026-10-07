'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Activity,
  Building2,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  GraduationCap,
  MessagesSquare,
  Settings2,
  Star,
  Sun,
  UserCog,
  Wallet,
} from 'lucide-react';
import { Card, ErrorState, Logo, SideNav, StatusBadge, type SideNavSection } from '@link/ui';
import { createTranslator, type Locale } from '@link/i18n';
import { useQuery } from '@tanstack/react-query';
import { ApiError, ownerApi, pilotApi, useMe } from '@link/api-client';
import { RequireStaff } from './owner/common';
import { AssistantPanel } from './owner/AssistantPanel';
import { useFlag } from './flags';
import { LangSwitch } from './LangSwitch';
import { API_MODE, PILOT } from './api-mode';
import { useSession } from './session';
import { useTryCentre } from '@demo';

/**
 * Owner web shell (11 §3 side navigation). Follow-up items (Phase 2) show with `followup.owner_nav`;
 * marketplace items only with `marketplace.enabled` (off in the MVP pilot, CF-29). Staff is always there.
 * A flagged-off item does not render at all (plan §1.5).
 */
export function CentreShell({
  locale,
  centreId,
  children,
}: {
  locale: Locale;
  centreId: string;
  children: ReactNode;
}) {
  const t = createTranslator(locale);
  const base = `/${locale}/centre/${centreId}`;
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const followUp = useFlag('followup.owner_nav');
  const assistant = useFlag('followup.assistant') && followUp;
  // Pilot: the centre's own name instead of the sample centre (A1).
  const pilotInfo = useQuery({ queryKey: ['pilot-info'], queryFn: pilotApi.info, enabled: PILOT });
  // A personalised demo ("Try Link with your centre") shows the visitor's centre name.
  const tryCentre = useTryCentre();
  const centreName = PILOT
    ? (pilotInfo.data?.centreName ?? '')
    : (tryCentre ?? t('owner.shell.centre'));
  const marketplace = useFlag('marketplace.enabled');
  const { session, signOut } = useSession();
  const me = useMe({ enabled: !!session });
  // An unknown centre id is "not found", not an empty workspace (one centre per world, 10 §2).
  const centre = useQuery({
    queryKey: ['centre-known', centreId],
    queryFn: () => ownerApi.staff(centreId),
    enabled: !!session,
    retry: false,
  });
  const unknownCentre = centre.error instanceof ApiError && centre.error.problem.status === 404;
  const [assistantOpen, setAssistantOpen] = useState(false);

  const sections: SideNavSection[] = [];
  if (followUp)
    sections.push({
      id: 'followup',
      items: [
        { id: 'today', label: t('owner.nav.today'), icon: <Sun />, href: `${base}/today` },
        {
          id: 'follow-ups',
          label: t('owner.nav.followUps'),
          icon: <ClipboardList />,
          href: `${base}/follow-ups`,
        },
        {
          id: 'students',
          label: t('owner.nav.students'),
          icon: <GraduationCap />,
          href: `${base}/students`,
        },
        {
          id: 'sessions',
          label: t('owner.nav.sessions'),
          icon: <CalendarCheck />,
          href: `${base}/sessions`,
        },
        {
          id: 'communication',
          label: t('owner.nav.communication'),
          icon: <MessagesSquare />,
          href: `${base}/communication`,
        },
      ],
    });
  if (marketplace)
    sections.push({
      id: 'marketplace',
      label: t('centre.nav.marketplace'),
      items: [
        {
          id: 'profile',
          label: t('centre.nav.publicProfile'),
          icon: <Building2 />,
          href: `${base}/profile`,
        },
        {
          id: 'schedule',
          label: t('centre.nav.roomSchedule'),
          icon: <CalendarDays />,
          href: `${base}/schedule`,
        },
        { id: 'reviews', label: t('centre.nav.reviews'), icon: <Star />, href: `${base}/reviews` },
        {
          id: 'rooms',
          label: t('centre.nav.roomsRequests'),
          icon: <DoorOpen />,
          href: `${base}/rooms`,
        },
        {
          id: 'rent-income',
          label: t('centre.nav.rentIncome'),
          icon: <Wallet />,
          href: `${base}/rent-income`,
        },
      ],
    });
  sections.push({
    id: 'workspace',
    label: t('centre.nav.workspace'),
    items: [
      ...(followUp
        ? [
            {
              id: 'rules',
              label: t('owner.nav.rules'),
              icon: <Settings2 />,
              href: `${base}/rules`,
            },
            {
              id: 'activity',
              label: t('owner.nav.activity'),
              icon: <Activity />,
              href: `${base}/activity`,
            },
          ]
        : []),
      { id: 'staff', label: t('centre.nav.staff'), icon: <UserCog />, href: `${base}/staff` },
    ],
  });

  const all = sections.flatMap((s) => s.items);
  // A message belongs to its follow-up (A06/A09 are reached from A03), so Follow-ups stays highlighted.
  const path = pathname.replace(`${base}/messages`, `${base}/follow-ups`);
  const activeId = all.find((i) => path.startsWith(i.href))?.id ?? all[0]?.id ?? 'staff';

  if (unknownCentre)
    return (
      <RequireStaff>
        <main id="main" className="flex min-h-dvh items-center justify-center bg-bg p-6">
          <Card padding="lg" className="flex w-full max-w-md flex-col items-center gap-2">
            <Logo variant="lockup-light" size={32} label={t('common.appName')} />
            <div data-testid="centre-not-found">
              <ErrorState
                title={t('owner.centreNotFound.title')}
                body={t('owner.centreNotFound.body')}
                action={
                  <Link
                    href={`/${locale}/centre`}
                    className="inline-flex min-h-11 items-center justify-center rounded-12 bg-blue px-5 text-label text-navy shadow-glow hover:brightness-95"
                  >
                    {t('owner.centreNotFound.back')}
                  </Link>
                }
              />
            </div>
          </Card>
        </main>
      </RequireStaff>
    );

  return (
    <RequireStaff>
      <div className="flex min-h-dvh bg-bg">
        <SideNav
          label={t('centre.nav.label')}
          sections={sections}
          activeId={activeId}
          header={
            <div className="flex flex-col gap-4 px-3">
              <Logo variant="lockup-light" size={32} label={t('common.appName')} />
              <div className="rounded-12 border border-border bg-soft p-3">
                <p className="text-label text-navy">
                  <bdi>{centreName}</bdi>
                </p>
                <p className="text-caption text-muted">{t('owner.shell.workspace')}</p>
              </div>
            </div>
          }
          footer={
            session ? (
              <div className="flex flex-col gap-1 px-3 text-caption text-muted">
                <span data-testid="signed-in-as">
                  {t('owner.shell.signedInAs', { name: me.data?.name ?? '' })}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    signOut();
                    router.replace(`/${locale}/centre`);
                  }}
                  className="inline-flex min-h-11 items-center self-start text-blueText"
                >
                  {t('owner.shell.signOut')}
                </button>
              </div>
            ) : null
          }
          renderLink={(item, props) => <Link href={item.href} {...props} />}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-white px-8 py-3">
            <p className="text-caption uppercase text-muted">
              {PILOT
                ? t('owner.pilot.breadcrumb', { centre: centreName })
                : t('owner.shell.breadcrumb')}
            </p>
            <div className="flex items-center gap-3">
              {API_MODE !== 'live' ? (
                <StatusBadge tone="neutral">{t('owner.shell.sampleData')}</StatusBadge>
              ) : null}
              {PILOT ? <StatusBadge tone="info">{t('owner.pilot.badge')}</StatusBadge> : null}
              {assistant ? (
                <button
                  type="button"
                  data-testid="open-assistant"
                  aria-expanded={assistantOpen}
                  onClick={() => setAssistantOpen(true)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-white px-4 text-label text-navy"
                >
                  <Logo variant="mark" size={24} label="" />
                  {t('owner.assistant.open')}
                </button>
              ) : null}
              <LangSwitch locale={locale} />
            </div>
          </header>
          <main id="main" className="flex flex-1 flex-col gap-6 p-8">
            {children}
          </main>
        </div>
        {assistant ? <AssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} /> : null}
      </div>
    </RequireStaff>
  );
}
