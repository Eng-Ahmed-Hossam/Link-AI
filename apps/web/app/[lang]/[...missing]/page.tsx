import { notFound } from 'next/navigation';

/** Any path no page matches: the app's own not-found page (./not-found.tsx), in the URL's language. */
export default function Missing() {
  notFound();
}
