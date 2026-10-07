'use client';

import { useEffect, type ComponentProps } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { track, type SiteEvent } from './analytics';

/** One page view per site page (PostHog, no cookies). */
export function PageView({ lang }: { lang: string }) {
  const pathname = usePathname();
  useEffect(() => track('$pageview', { lang }), [pathname, lang]);
  return null;
}

/** A link that counts one of the two landing buttons. */
export function TrackedLink({
  event,
  lang,
  placement,
  ...props
}: ComponentProps<typeof Link> & { event: SiteEvent; lang: string; placement: string }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        track(event, { lang, placement });
        props.onClick?.(e);
      }}
    />
  );
}
