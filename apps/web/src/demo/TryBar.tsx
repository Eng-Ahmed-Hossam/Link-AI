'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import type { Locale } from '@link/i18n';
import { createTranslator } from '@link/i18n';
import { webButtonClass } from '@link/ui';
import { readTry, resetTry, writeTry, type TrySession } from './try';

/** Two minutes in the demo before the pilot card may show (never during a task, see below). */
const CARD_AFTER_MS = 2 * 60_000;
/** Pages where a task has just ended: a role's home or an overview, not a form. */
const CALM_PAGE = /(\/centre\/[^/]+\/(schedule|today|follow-ups)|\/search)$/;

/**
 * The demo banner on every app page while a demo is on: "Demo — sample data", "Switch role" (back to
 * the role chooser), "About this demo" and "Reset demo". After two minutes, a gentle card offering
 * a free pilot, only on a role's home or an overview (never in the middle of a task).
 */
export function TryBar({ locale }: { locale: Locale }) {
  const t = createTranslator(locale);
  const pathname = usePathname() ?? '';
  const [demo, setDemo] = useState<TrySession | null>(null);
  const [card, setCard] = useState(false);

  useEffect(() => {
    const s = readTry();
    setDemo(s);
    if (!s || s.cardDone || !CALM_PAGE.test(pathname)) return;
    const wait = Math.max(0, s.startedAt + CARD_AFTER_MS - Date.now());
    // Already past two minutes: show on this calm page. Not yet: show when it is, if still here.
    const id = window.setTimeout(() => setCard(true), wait);
    return () => window.clearTimeout(id);
  }, [pathname]);

  if (!demo) return null;
  const closeCard = () => {
    setCard(false);
    writeTry({ ...demo, cardDone: true });
  };
  const pilotHref = `/${locale}/pilot`;

  return (
    <>
      <div
        role="region"
        aria-label={t('landing.demo.banner')}
        data-testid="try-banner"
        className="sticky top-0 z-40 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-navy px-4 py-2 text-caption text-white"
      >
        <span className="font-semibold">{t('landing.demo.banner')}</span>
        <span aria-hidden className="opacity-60">
          ·
        </span>
        <Link
          href={`/${locale}/try`}
          data-testid="switch-role"
          className="inline-flex min-h-11 items-center px-2 font-semibold underline underline-offset-2"
        >
          {t('common.switchRole')}
        </Link>
        <details className="group" data-testid="try-about">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center px-2 underline underline-offset-2 [&::-webkit-details-marker]:hidden">
            {t('landing.demo.about')}
          </summary>
          <p className="absolute inset-x-4 top-full z-50 mx-auto mt-1 max-w-lg rounded-16 bg-navy p-4 text-caption text-white shadow-raised">
            {t('landing.demo.teacherNote')}
          </p>
        </details>
        <button
          type="button"
          onClick={() => void resetTry(locale)}
          data-testid="try-reset"
          className="inline-flex min-h-11 items-center rounded-full px-3 font-semibold text-[#7fd8ff] underline underline-offset-2"
        >
          {t('landing.demo.reset')}
        </button>
      </div>
      {card ? (
        <aside
          aria-label={t('landing.demo.cardTitle')}
          data-testid="try-pilot-card"
          className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md flex-col gap-3 rounded-24 border border-border bg-white p-5 shadow-raised sm:inset-x-auto sm:end-6"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1">
              <p className="text-heading text-navy">{t('landing.demo.cardTitle')}</p>
              <p className="text-body text-muted">{t('landing.demo.cardBody')}</p>
            </div>
            <button
              type="button"
              onClick={closeCard}
              aria-label={t('landing.demo.cardLater')}
              className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-soft"
            >
              <X aria-hidden className="size-5" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href={pilotHref} onClick={closeCard} className={webButtonClass('primary')}>
              {t('landing.demo.cardCta')}
            </Link>
            <button
              type="button"
              onClick={closeCard}
              className="min-h-11 px-2 text-label text-blueText"
            >
              {t('landing.demo.cardLater')}
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
