'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, StatusBadge, type StatusTone } from '@link/ui';
import { useI18n } from '../i18n-client';
import { useSession, type Session } from '../session';
import { DEMO_CONTROLS } from '../api-mode';
import {
  DEMO_PARAMS,
  SCREENS,
  figmaUrl,
  fillPath,
  type Screen,
  type ScreenStatus,
} from '../screens';
import { useDemoState } from './demo-state';

/** The sample accounts (docs/14 §5.1). Mock tokens only: no real auth. */
const SAMPLE: Record<'owner' | 'reception' | 'parent', { label: string; session: Session }> = {
  owner: {
    label: 'Owner (Tamer)',
    session: { accessToken: 'mock.usr-owner', userId: 'usr-owner', roles: ['centre_owner'] },
  },
  reception: {
    label: 'Reception (Dina)',
    session: {
      accessToken: 'mock.usr-reception',
      userId: 'usr-reception',
      roles: ['centre_staff'],
    },
  },
  parent: {
    label: 'Parent (Hassan)',
    session: { accessToken: 'mock.usr-parent', userId: 'usr-parent', roles: ['parent'] },
  },
};

const TONE: Record<ScreenStatus, StatusTone> = {
  built: 'success',
  placeholder: 'neutral',
  'needs design review': 'warning',
  'dev only': 'info',
};

const GROUPS: { title: string; pick: (s: Screen) => boolean }[] = [
  { title: 'Web · public pages', pick: (s) => s.app === 'web' && s.roles.includes('anyone') },
  {
    title: 'Web · parent PWA (role: parent)',
    pick: (s) => s.app === 'web' && s.roles.includes('parent'),
  },
  {
    title: 'Web · centre workspace (roles: owner, Reception)',
    pick: (s) => s.app === 'web' && s.roles.includes('owner'),
  },
  { title: 'Teacher app (role: teacher)', pick: (s) => s.app === 'teacher' },
];

/**
 * `/{lang}/dev` — every screen with its link, status and Figma frame, plus one-click sign-in as
 * each sample user. Demo only: the page 404s in the pilot and live modes, and the pilot build swaps
 * this module for a stub (the start-up check looks for `data-dev-index` in the bundle).
 * English only on purpose, like the Demo controls: a developer tool, not a product screen.
 */
export function DevIndex() {
  const { locale } = useI18n();
  const { session, signIn, signOut } = useSession();
  const demo = useDemoState();
  const [teacherApp, setTeacherApp] = useState('http://localhost:8081');
  useEffect(() => setTeacherApp(`${location.protocol}//${location.hostname}:8081`), []);

  // Record ids follow the session dates; the case, message and draft come from the live scenario.
  const params: Record<string, string | undefined> = {
    ...DEMO_PARAMS,
    caseId: demo?.cases[0]?.id,
    messageId: demo?.messages.at(-1)?.id,
    recordId: demo?.signals[0]?.evidence.at(-1)?.recordId,
  };
  const teacherParams = { ...params, recordId: demo?.records.drafts[0] };
  const who = Object.values(SAMPLE).find((s) => s.session.userId === session?.userId)?.label;

  return (
    <main
      id="main"
      lang="en"
      dir="ltr"
      data-dev-index
      className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 bg-bg p-6"
    >
      <header className="flex flex-col gap-2">
        <h1 className="text-title text-navy">Link · dev route index (demo only)</h1>
        <p className="text-body text-muted">
          Every screen, grouped by app and role. Links open in{' '}
          {locale === 'ar' ? 'Arabic' : 'English'} (switch:{' '}
          <Link className="text-blueText underline" href="/ar/dev">
            /ar/dev
          </Link>{' '}
          ·{' '}
          <Link className="text-blueText underline" href="/en/dev">
            /en/dev
          </Link>
          ). Sample data only.
        </p>
      </header>

      <Card padding="lg" className="flex flex-col gap-4">
        <h2 className="text-heading text-navy">Sign in as a sample user</h2>
        <p className="text-body text-muted" data-testid="dev-signed-in">
          {who ? `Signed in as ${who}.` : 'Not signed in.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SAMPLE) as (keyof typeof SAMPLE)[]).map((k) => (
            <Button
              key={k}
              variant="secondary"
              data-testid={`dev-sign-in-${k}`}
              onClick={() => signIn(SAMPLE[k].session)}
            >
              {SAMPLE[k].label}
            </Button>
          ))}
          <a
            className="inline-flex min-h-11 items-center rounded-12 border border-border bg-white px-5 text-label text-navy hover:bg-soft"
            href={`${teacherApp}/sign-in?sample=1`}
            data-testid="dev-sign-in-teacher"
          >
            Teacher (Ms Salma) ↗
          </a>
          {session ? (
            <Button variant="quiet" onClick={signOut}>
              Sign out
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-muted">
          OTP code for every demo phone sign-in: <bdi dir="ltr">123456</bdi>. The teacher app runs
          on its own address, so its button signs in there.
        </p>
      </Card>

      <Card padding="lg" className="flex flex-col gap-3">
        <h2 className="text-heading text-navy">Tools</h2>
        <ul className="flex flex-col gap-2 text-body">
          <li>
            <a className="text-blueText underline" href={teacherApp}>
              Teacher app ({teacherApp})
            </a>
          </li>
          <li>
            {DEMO_CONTROLS ? (
              <button
                type="button"
                className="min-h-11 text-blueText underline"
                data-testid="dev-open-demo-controls"
                onClick={() => window.dispatchEvent(new Event('link:demo-controls'))}
              >
                Open the Demo controls
              </button>
            ) : (
              <span className="text-muted">Demo controls are off (NEXT_PUBLIC_DEMO_CONTROLS).</span>
            )}{' '}
            <span className="text-muted">(also the amber button at the bottom of every page)</span>
          </li>
          <li>
            <a className="text-blueText underline" href="http://localhost:4010/__demo/state">
              Mock server state (JSON)
            </a>
          </li>
        </ul>
      </Card>

      {GROUPS.map((g) => (
        <section key={g.title} className="flex flex-col gap-2">
          <h2 className="text-heading text-navy">{g.title}</h2>
          <div className="overflow-x-auto rounded-12 border border-border bg-white">
            <table className="w-full text-start text-body">
              <thead className="bg-soft text-caption text-muted">
                <tr>
                  <th className="p-2 text-start">ID</th>
                  <th className="p-2 text-start">Screen</th>
                  <th className="p-2 text-start">Link</th>
                  <th className="p-2 text-start">Modes</th>
                  <th className="p-2 text-start">Status</th>
                  <th className="p-2 text-start">Figma</th>
                </tr>
              </thead>
              <tbody>
                {SCREENS.filter(g.pick).map((s) => {
                  const path = fillPath(s.path, s.app === 'teacher' ? teacherParams : params);
                  const href = path
                    ? s.app === 'teacher'
                      ? `${teacherApp}${path}`
                      : `/${locale}${path}`
                    : null;
                  return (
                    <tr
                      key={s.id}
                      className="border-t border-border"
                      data-testid={`dev-screen-${s.id}`}
                    >
                      <td className="p-2 font-semibold text-navy">{s.id}</td>
                      <td className="p-2">
                        {s.name}
                        {s.flag ? (
                          <span className="ms-2 text-caption text-muted">
                            ({s.flag === 'phase2' ? 'Phase 2 flag' : 'marketplace flag'})
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2">
                        {href ? (
                          <a className="break-all text-blueText underline" href={href}>
                            {s.app === 'teacher' ? path : `/${locale}${path}`}
                          </a>
                        ) : (
                          <span className="text-muted">{s.flow ?? 'reached in a flow'}</span>
                        )}
                        {href && s.flow ? (
                          <span className="block text-caption text-muted">
                            in the flow: {s.flow}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-2 text-caption">{s.modes.join(' · ')}</td>
                      <td className="p-2">
                        <StatusBadge tone={TONE[s.status]}>{s.status}</StatusBadge>
                      </td>
                      <td className="p-2">
                        {s.figma ? (
                          <a className="text-blueText underline" href={figmaUrl(s.figma)}>
                            {s.figma}
                          </a>
                        ) : (
                          <span className="text-caption text-muted">no frame</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </main>
  );
}
