import { notFound } from 'next/navigation';
import { PILOT } from '@/api-mode';
import { PublicProfile } from '@/owner/market/Profile';

/** Marketplace pages are not part of the MVP pilot (CF-29). */
export default function Page() {
  if (PILOT) notFound();
  return <PublicProfile />;
}
