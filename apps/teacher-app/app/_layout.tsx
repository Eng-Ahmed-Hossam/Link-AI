import { useEffect, useState } from 'react';
import { I18nManager, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Cairo_400Regular, Cairo_600SemiBold, Cairo_700Bold } from '@expo-google-fonts/cairo';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { MockBadge } from '@link/ui-native';
import { color } from '@link/tokens';
import { startMocks } from '@link/mocks/native';
import { LocaleProvider, useLocale } from '@/locale';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const USE_MOCKS = process.env.EXPO_PUBLIC_USE_MOCKS !== 'false';

function Shell() {
  const { locale, t } = useLocale();
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, direction: locale === 'ar' ? 'rtl' : 'ltr' }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
      {USE_MOCKS ? <MockBadge locale={locale} label={t('common.mockBadge')} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  const [mocksReady, setMocksReady] = useState(!USE_MOCKS);

  useEffect(() => {
    if (!USE_MOCKS) return;
    try {
      startMocks();
    } catch (e) {
      // MSW 3 has no native entry; if it cannot start we keep the app usable.
      console.warn('Mock server failed to start', e);
    }
    setMocksReady(true);
  }, []);

  // Keep RTL on for first paint when the default (Arabic) is active.
  void I18nManager;

  if (!fontsLoaded || !mocksReady) return null;
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <Shell />
        </LocaleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
