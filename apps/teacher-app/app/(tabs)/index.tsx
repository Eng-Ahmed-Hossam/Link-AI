import { Redirect } from 'expo-router';
import { useMarketplace, usePhase2 } from '@/flags';

/** One home per role (2A.6): My groups with the marketplace; Today in the follow-up-only pilot. */
export default function TabsIndex() {
  const phase2 = usePhase2();
  const marketplace = useMarketplace();
  if (phase2 === undefined || marketplace === undefined) return null;
  return <Redirect href={marketplace || !phase2 ? '/groups' : '/today'} />;
}
