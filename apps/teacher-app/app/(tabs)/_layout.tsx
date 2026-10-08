import { Redirect, Tabs } from 'expo-router';
import { CalendarCheck, ClipboardList, DoorOpen, Users, Wallet } from 'lucide-react-native';
import { color } from '@link/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from '@link/ui-native';
import { useLocale } from '@/locale';
import { useSession } from '@/session';
import { useFollowup, useMarketplace } from '@/flags';
import { tabsFor } from '@/tabs';

export default function TabsLayout() {
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const { session, ready } = useSession();
  const followup = useFollowup();
  const marketplace = useMarketplace();
  if (ready && !session) return <Redirect href="/sign-in" />;
  const labels: Record<string, string> = {
    // With the marketplace, the follow-up home is the "Follow-up" tab (a paid extra, OD-58).
    today: marketplace !== false ? t('teacher.tabs.followup') : t('teacher.tabs.today'),
    groups: t('teacher.tabs.groups'),
    rooms: t('teacher.tabs.rooms'),
    earnings: t('teacher.tabs.earnings'),
    records: t('teacher.tabs.records'),
  };
  const icons: Record<string, typeof Users> = {
    today: CalendarCheck,
    groups: Users,
    rooms: DoorOpen,
    earnings: Wallet,
    records: ClipboardList,
  };
  const shown = tabsFor(followup === true, marketplace !== false);
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          locale={locale}
          bottomInset={insets.bottom}
          activeId={state.routes[state.index]?.name ?? 'groups'}
          items={shown
            .map((name) => state.routes.find((r) => r.name === name))
            .filter((r): r is NonNullable<typeof r> => !!r)
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
