import { Placeholder } from '@/Placeholder';
import { useLocale } from '@/locale';

export default function Rooms() {
  return <Placeholder title={useLocale().t('teacher.tabs.rooms')} />;
}
