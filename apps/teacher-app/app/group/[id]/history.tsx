import { useLocalSearchParams } from 'expo-router';
import { RecordsHistory } from '@/screens/RecordsHistory';

/** T13 · Records history for one group (from My groups or T06). */
export default function History() {
  const { id, record } = useLocalSearchParams<{ id: string; record?: string }>();
  return <RecordsHistory groupId={id} highlight={record} back />;
}
