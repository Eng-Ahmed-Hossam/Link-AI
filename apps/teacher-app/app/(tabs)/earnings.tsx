import { Placeholder } from '@/Placeholder';
import { useLocale } from '@/locale';

export default function Earnings() {
  return <Placeholder title={useLocale().t('teacher.tabs.earnings')} />;
}
