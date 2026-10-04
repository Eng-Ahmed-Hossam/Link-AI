import { Redirect } from 'expo-router';
import { usePhase2 } from '@/flags';

/** Start on Today with the Phase 2 flag, on My groups without it. */
export default function TabsIndex() {
  const phase2 = usePhase2();
  if (phase2 === undefined) return null;
  return <Redirect href={phase2 ? '/today' : '/groups'} />;
}
