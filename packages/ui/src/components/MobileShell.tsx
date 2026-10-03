import type { ReactNode } from 'react';
import { cn } from '../cn';

/**
 * Parent/public mobile page frame (Figma 390 frames): header wash, app header
 * (lockup + eyebrow + trailing slot), 20 px page padding, 20 px section gap.
 */
export function MobileShell({
  logo,
  eyebrow,
  trailing,
  children,
  footer,
  className,
}: {
  logo: ReactNode;
  /** Small upper-case context label ("PARENT", "WELCOME"). */
  eyebrow?: string;
  trailing?: ReactNode;
  children: ReactNode;
  /** Sticky bottom area (tab bar or sticky CTA). */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('relative mx-auto flex min-h-dvh w-full max-w-md flex-col bg-bg', className)}
    >
      {/* Header wash: blueSoft fading to the page background (Figma "Header wash"). */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-blueSoft to-bg/0"
      />
      <header className="relative flex items-center gap-4 px-5 pt-5">
        {logo}
        {eyebrow ? <span className="text-caption uppercase text-muted">{eyebrow}</span> : null}
        <span className="ms-auto">{trailing}</span>
      </header>
      <main id="main" className="relative flex flex-1 flex-col gap-5 px-5 pb-6 pt-5">
        {children}
      </main>
      {footer ? <div className="sticky bottom-0 z-10 px-5 pb-5">{footer}</div> : null}
    </div>
  );
}

/** Page title block: optional context line, title (Link/Title) and a muted subtitle. */
export function PageTitle({
  context,
  title,
  subtitle,
}: {
  context?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {context ? <div className="text-caption text-muted">{context}</div> : null}
      <h1 className="text-title text-navy">{title}</h1>
      {subtitle ? <p className="text-body text-muted">{subtitle}</p> : null}
    </div>
  );
}
