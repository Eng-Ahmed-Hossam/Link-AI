import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Callout, ScreenHeader, textStyle } from '@link/ui-native';
import { color, space } from '@link/tokens';
import { useLocale } from '../locale';
import { useOnline } from '../net';
import { offlineStore } from '../offline/store';

/**
 * Teacher app screen frame: header (lockup, role, "Al Nour Centre • Sample data"), an offline
 * banner whenever the last call could not reach the server, and the scrolling body.
 */
export function Screen({
  title,
  subtitle,
  step,
  back,
  children,
  footer,
  showStorageNote,
  testID,
}: {
  title: string;
  subtitle?: string;
  step?: { index: number; total: number; optional?: boolean };
  back?: boolean | (() => void);
  children: ReactNode;
  /** Sticky actions at the bottom. */
  footer?: ReactNode;
  /** Say where drafts and recordings are kept (dev store: not encrypted). */
  showStorageNote?: boolean;
  testID?: string;
}) {
  const { locale, t } = useLocale();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const online = useOnline();
  const onBack = back === true ? () => router.back() : back || undefined;
  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: color.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.page, { paddingTop: insets.top + space[12] }]}
      >
        <ScreenHeader
          locale={locale}
          role={t('teacher.header.role')}
          context={t('teacher.header.context')}
          title={title}
          subtitle={subtitle}
          step={
            step
              ? {
                  index: step.index,
                  total: step.total,
                  label: step.optional
                    ? t('teacher.record.stepOptional', { current: step.index, total: step.total })
                    : t('common.stepOf', { current: step.index, total: step.total }),
                }
              : undefined
          }
          onBack={onBack}
          backLabel={t('common.back')}
        />
        {!online ? (
          <Callout
            locale={locale}
            tone="warning"
            role="alert"
            title={t('states.offline.title')}
            body={t('teacher.offline.body')}
          />
        ) : null}
        {children}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
        {showStorageNote ? (
          <Text
            testID="storage-note"
            style={[textStyle(locale, 'caption'), { color: color.muted }]}
          >
            {offlineStore.encrypted
              ? t('teacher.storage.encrypted')
              : t('teacher.storage.placeholder')}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space[20], paddingBottom: 120, gap: space[16] },
  footer: { gap: space[12] },
});
