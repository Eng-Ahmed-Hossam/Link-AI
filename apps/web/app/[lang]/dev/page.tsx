import { notFound } from 'next/navigation';
import { DevIndex } from '@demo';
import { API_MODE, PILOT } from '@/api-mode';

/** Dev route index: demo and mock modes only. The pilot build has a stub here (and 404s). */
export default function DevPage() {
  if (PILOT || API_MODE === 'live') notFound();
  return <DevIndex />;
}
