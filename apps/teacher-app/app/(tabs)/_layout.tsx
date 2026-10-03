import { Tabs } from 'expo-router';
import { DoorOpen, Users, Wallet } from 'lucide-react-native';
import { color } from '@link/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabBar } from '@link/ui-native';
import { useLocale } from '@/locale';

/** Marketplace tabs: My groups · Rooms · Earnings (11 §3). Records tabs are Phase 2. */
export default function TabsLayout() {
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const labels: Record<string, string> = {
    index: t('teacher.tabs.groups'),
    rooms: t('teacher.tabs.rooms'),
    earnings: t('teacher.tabs.earnings'),
  };
  const icons: Record<string, typeof Users> = { index: Users, rooms: DoorOpen, earnings: Wallet };
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          locale={locale}
          bottomInset={insets.bottom}
          activeId={state.routes[state.index]?.name ?? 'index'}
          items={state.routes.map((r) => {
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
