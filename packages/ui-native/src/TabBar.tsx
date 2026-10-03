import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, space, type Locale } from '@link/tokens';
import { textStyle, touchTarget } from './theme';

export interface TabBarItem {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface TabBarProps {
  locale: Locale;
  items: TabBarItem[];
  activeId: string;
  onSelect: (id: string) => void;
  /** Bottom safe-area inset. */
  bottomInset?: number;
}

/**
 * Bottom tab bar shell for the teacher app: My groups · Rooms · Earnings (11 §3).
 * A row's children flow with the layout direction, so Arabic mirrors automatically.
 */
export function TabBar({ locale, items, activeId, onSelect, bottomInset = 0 }: TabBarProps) {
  return (
    <View accessibilityRole="tablist" style={[styles.bar, { paddingBottom: bottomInset }]}>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onSelect(item.id)}
            style={styles.tab}
          >
            <View style={[styles.pill, active && { backgroundColor: color.blueSoft }]}>
              {item.icon}
            </View>
            <Text
              style={[
                textStyle(locale, active ? 'label' : 'caption'),
                { color: active ? color.navy : color.muted },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.white,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  tab: {
    flex: 1,
    minHeight: touchTarget + 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
    paddingVertical: space[8],
  },
  pill: {
    minWidth: 48,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
