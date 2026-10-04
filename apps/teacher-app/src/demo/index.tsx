import { useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { demoApi, type DemoSnapshot } from '@link/api-client';
import { Button, Sheet, textStyle } from '@link/ui-native';
import { color, radius, space } from '@link/tokens';
import { DEMO_CONTROLS } from './api-mode';

/** Polls `/__demo/state` while Demo controls are on (same switch the web apps follow). */
let snapshot: DemoSnapshot | null = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

export async function refreshDemoState() {
  try {
    const next = await demoApi.state();
    if (JSON.stringify(next) !== JSON.stringify(snapshot)) {
      snapshot = next;
      listeners.forEach((l) => l());
    }
  } catch {
    /* offline switch or server down: keep the last snapshot */
  }
}

export function useDemoState(): DemoSnapshot | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      if (DEMO_CONTROLS && !timer) {
        void refreshDemoState();
        timer = setInterval(refreshDemoState, 2000);
      }
      return () => {
        listeners.delete(l);
        if (!listeners.size && timer) {
          clearInterval(timer);
          timer = null;
        }
      };
    },
    () => (DEMO_CONTROLS ? snapshot : null),
    () => null,
  );
}

/**
 * Demo controls for the presenter (dev only: APP_ENV=local + EXPO_PUBLIC_DEMO_CONTROLS=1).
 * English only on purpose: a tool, not a product screen.
 */
export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const s = useDemoState();
  const qc = useQueryClient();
  useEffect(() => setNote(null), [open]);
  if (!DEMO_CONTROLS) return null;

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setNote(`${label}: done`);
    } catch (e) {
      setNote(`${label}: ${(e as Error).message}`);
    }
    await refreshDemoState();
    await qc.invalidateQueries();
  };

  return (
    <>
      <Pressable
        testID="demo-controls"
        accessibilityRole="button"
        accessibilityLabel="Demo controls"
        onPress={() => setOpen(true)}
        style={styles.fab}
      >
        <Text style={[textStyle('en', 'caption'), { color: color.navy, fontWeight: '600' }]}>
          Demo
        </Text>
      </Pressable>
      <Sheet
        locale="en"
        open={open}
        onClose={() => setOpen(false)}
        title="Demo controls"
        closeLabel="Close"
      >
        <View style={{ gap: space[12] }}>
          <Text style={[textStyle('en', 'caption'), { color: color.muted }]}>
            Scenario demo-followup · {s?.records.confirmed ?? '–'} confirmed ·{' '}
            {s?.signals.length ?? '–'} flag(s) · drafts {s?.records.drafts.length ?? '–'}
          </Text>
          <Button
            locale="en"
            variant="secondary"
            danger
            label="Reset scenario"
            onPress={() => run('Reset', demoApi.reset)}
          />
          <Button
            locale="en"
            variant="secondary"
            label={`Phase 2 flag: ${s?.demo.phase2 ? 'on' : 'off'}`}
            onPress={() => run('Phase 2', () => demoApi.settings({ phase2: !s?.demo.phase2 }))}
          />
          <Button
            locale="en"
            variant="secondary"
            label={`Marketplace flag: ${s?.demo.marketplace === false ? 'off' : 'on'}`}
            onPress={() =>
              run('Marketplace', () =>
                demoApi.settings({ marketplace: s?.demo.marketplace === false }),
              )
            }
          />
          <Button
            locale="en"
            variant="secondary"
            label="Simulate a new day"
            onPress={() => run('New day', demoApi.newDay)}
          />
          <Button
            locale="en"
            variant="secondary"
            label={`Offline: ${s?.demo.offline ? 'on' : 'off'}`}
            onPress={() => run('Offline', () => demoApi.settings({ offline: !s?.demo.offline }))}
          />
          <Button
            locale="en"
            variant="secondary"
            label={`Speech-to-text down: ${s?.demo.sttDown ? 'yes' : 'no'}`}
            onPress={() => run('STT', () => demoApi.settings({ sttDown: !s?.demo.sttDown }))}
          />
          <Button
            locale="en"
            variant="secondary"
            label="Next confirm fails (before saving)"
            onPress={() => run('Fault', () => demoApi.settings({ confirmFault: 'before_commit' }))}
          />
          <Button
            locale="en"
            variant="secondary"
            label="Provider: Sent → Delivered"
            onPress={() => run('Provider', () => demoApi.provider('advance'))}
          />
          <Button
            locale="en"
            variant="secondary"
            label="Provider: fail delivery"
            onPress={() => run('Provider', () => demoApi.provider('fail'))}
          />
          <Button
            locale="en"
            variant="secondary"
            label="Deliver the parent's reply"
            onPress={() => run('Reply', () => demoApi.reply())}
          />
          {note ? (
            <Text accessibilityLiveRegion="polite" style={textStyle('en', 'caption')}>
              {note}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 96,
    start: space[12],
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space[12],
    borderRadius: radius[24],
    backgroundColor: color.amberSoft,
    borderWidth: 1,
    borderColor: color.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
