import { Pressable, StyleSheet, View } from 'react-native';
import { color } from '@link/tokens';

/**
 * On/off switch (Figma: "Open to new teaching slots", "Monthly subscription"). A `switch` with a
 * 44 pt target; the knob moves to the end when on (row direction follows RTL), so the state is a
 * shape change, not colour alone. React Native's own Switch draws its knob outside the track in
 * RTL on the web.
 */
export function Toggle({
  value,
  onValueChange,
  label,
  testID,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      aria-checked={value}
      accessibilityLabel={label}
      onPress={() => onValueChange(!value)}
      testID={testID}
      style={styles.target}
    >
      <View
        style={[
          styles.track,
          { backgroundColor: value ? color.blue : color.border },
          { justifyContent: value ? 'flex-end' : 'flex-start' },
        ]}
      >
        <View style={styles.knob} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  track: { width: 44, height: 24, borderRadius: 12, padding: 2, flexDirection: 'row' },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: color.white },
});
