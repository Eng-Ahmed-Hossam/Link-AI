'use client';

import { useState } from 'react';
import { Building2, GraduationCap, Users } from 'lucide-react';
import { WebArrow } from '@link/ui';
import type { Locale } from '@link/i18n';
import type { ROLE_KEYS, Strings } from './strings';

type Role = 'parent' | 'teacher' | 'owner';
type Key = (typeof ROLE_KEYS)[number];

/**
 * The role chooser (`/{lang}/try`): Parent · Teacher · Centre owner. Each opens that role's app
 * signed in as the sample user; the only way into the apps from the public pages.
 */
export function RoleChooser({ locale, s }: { locale: Locale; s: Strings<typeof ROLE_KEYS> }) {
  const t = (k: Key) => s[k];
  const [opening, setOpening] = useState<Role | null>(null);
  const [failed, setFailed] = useState(false);
  const roles: { id: Role; title: Key; body: Key; cta: Key; icon: typeof Users }[] = [
    {
      id: 'parent',
      title: 'site.try.parent',
      body: 'site.try.parentBody',
      cta: 'site.try.openParent',
      icon: Users,
    },
    {
      id: 'teacher',
      title: 'site.try.teacher',
      body: 'site.try.teacherBody',
      cta: 'site.try.openTeacher',
      icon: GraduationCap,
    },
    {
      id: 'owner',
      title: 'site.try.owner',
      body: 'site.try.ownerBody',
      cta: 'site.try.openOwner',
      icon: Building2,
    },
  ];

  async function open(role: Role) {
    setOpening(role);
    setFailed(false);
    try {
      const { startTry } = await import('@demo');
      if (!startTry) throw new Error('unavailable');
      window.location.assign(await startTry({ role, lang: locale }));
    } catch {
      setFailed(true);
      setOpening(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid gap-4 md:grid-cols-3">
        {roles.map(({ id, title, body, cta, icon: Icon }) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => open(id)}
              disabled={opening !== null}
              data-testid={`role-${id}`}
              className="group flex h-full w-full flex-col items-start gap-4 rounded-24 border border-border bg-white p-6 text-start shadow-card transition-[border-color,box-shadow] hover:border-blue hover:shadow-raised focus-visible:outline-2 focus-visible:outline-blue disabled:opacity-70"
            >
              <span
                aria-hidden
                className="flex size-14 items-center justify-center rounded-16 bg-blueSoft text-blueText"
              >
                <Icon className="size-7" />
              </span>
              <span className="text-[22px] leading-[1.32] font-bold text-navy">{t(title)}</span>
              <span className="flex-1 text-[15px] leading-[1.6] text-muted">{t(body)}</span>
              <span className="inline-flex items-center gap-2 text-[15px] font-bold text-blueText">
                {opening === id ? t('site.try.opening') : t(cta)}
                {opening === id ? null : <WebArrow />}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="rounded-12 bg-redSoft px-4 py-3 text-[14px] text-red">
          {t('site.try.failed')}
        </p>
      ) : null}
      <p className="text-center text-[13px] text-muted">{t('site.try.sample')}</p>
    </div>
  );
}
