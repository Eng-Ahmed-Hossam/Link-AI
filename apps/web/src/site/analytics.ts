/**
 * Privacy-friendly analytics for the public website (PostHog, docs/05): page views and the two
 * landing buttons, nothing else. No cookies, no storage, no personal data: each page load gets a
 * random id kept in memory, person profiles are off, and URLs are sent without their query.
 * Off unless NEXT_PUBLIC_POSTHOG_KEY is set.
 */
export type SiteEvent = '$pageview' | 'landing_try_click' | 'landing_pilot_click';

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://eu.i.posthog.com';
const pageLoad =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : String(Math.random()).slice(2);

export const analyticsOn = () => !!KEY;

export function track(event: SiteEvent, props: { lang: string; placement?: string }) {
  if (!KEY || typeof window === 'undefined') return;
  const body = JSON.stringify({
    api_key: KEY,
    event,
    distinct_id: pageLoad,
    properties: {
      $current_url: `${location.origin}${location.pathname}`,
      $process_person_profile: false,
      $lib: 'link-site',
      ...props,
    },
  });
  // text/plain keeps it a simple request (no preflight); keepalive lets it finish on navigation.
  void fetch(`${HOST}/capture/`, {
    method: 'POST',
    body,
    keepalive: true,
    headers: { 'content-type': 'text/plain' },
  }).catch(() => {});
}
