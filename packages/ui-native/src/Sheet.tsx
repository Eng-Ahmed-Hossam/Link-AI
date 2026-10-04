import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { color, radius, space, type Locale } from '@link/tokens';
import { textStyle, touchTarget } from './theme';

/** Bottom sheet (11 §3, T11 / AR05). The backdrop and the close button both dismiss it. */
export function Sheet({
  locale,
  open,
  onClose,
  title,
  closeLabel,
  children,
}: {
  locale: Locale;
  open: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
}) {
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={closeLabel} style={styles.backdrop} onPress={onClose} />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { direction: locale === 'ar' ? 'rtl' : 'ltr' }]}
      >
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[textStyle(locale, 'heading'), { flex: 1 }]}>
            {title}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            onPress={onClose}
            style={styles.close}
          >
            <Text style={textStyle(locale, 'heading')}>{'×'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: space[16], paddingBottom: space[24] }}>
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: color.navy, opacity: 0.4 },
  sheet: {
    maxHeight: '85%',
    backgroundColor: color.white,
    borderTopStartRadius: radius[24],
    borderTopEndRadius: radius[24],
    padding: space[20],
    gap: space[12],
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: color.border,
  },
  head: { flexDirection: 'row', alignItems: 'center' },
  close: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
