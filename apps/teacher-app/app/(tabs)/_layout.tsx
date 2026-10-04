import { Redirect, Tabs } from 'expo-router';
import { CalendarCheck, DoorOpen, Users, Wallet } from 'lucide-react-native';
import { color } from '@link/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from '@link/ui-native';
import { useLocale } from '@/locale';
import { useSession } from '@/session';
import { usePhase2 } from '@/flags';

/**
 * Tabs: Today · My groups · Rooms · Earnings (CF-29, question for the team). Records are reached
 * from My groups and Today, not a tab. Today is Phase 2 and is not rendered at all when the flag
 * is off (plan §1.5).
 */
const ORDER = ['today', 'groups', 'rooms', 'earnings'];

export default function TabsLayout() {
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const { session, ready } = useSession();
  const phase2 = usePhase2();
  if (ready && !session) return <Redirect href="/sign-in" />;
  const labels: Record<string, string> = {
    today: t('teacher.tabs.today'),
    groups: t('teacher.tabs.groups'),
    rooms: t('teacher.tabs.rooms'),
    earnings: t('teacher.tabs.earnings'),
  };
  const icons: Record<string, typeof Users> = {
    today: CalendarCheck,
    groups: Users,
    rooms: DoorOpen,
    earnings: Wallet,
  };
  const visible = (name: string) => name !== 'index' && (name !== 'today' || phase2 === true);
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          locale={locale}
          bottomInset={insets.bottom}
          activeId={state.routes[state.index]?.name ?? 'groups'}
          items={ORDER.map((name) => state.routes.find((r) => r.name === name))
            .filter((r): r is NonNullable<typeof r> => !!r && visible(r.name))
            .map((r) => {
              const Icon = icons[r.name] ?? Users;
              return {
                id: r.name,
                label: labels[r.name] ?? r.name,
                icon: <Icon size={20} color={color.navy} />,
              };
            })}
          onSelect={(id) => navigation.navigate(id)}
        />
      )}
    />
  );
}
