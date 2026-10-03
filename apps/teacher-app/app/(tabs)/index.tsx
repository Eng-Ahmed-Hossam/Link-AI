import { Placeholder } from '@/Placeholder';
import { useLocale } from '@/locale';

export default function MyGroups() {
  return <Placeholder title={useLocale().t('teacher.tabs.groups')} />;
}
