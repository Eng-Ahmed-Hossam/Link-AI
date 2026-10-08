/**
 * `@demo` in pilot builds (next.config `resolveAlias`): the same names, doing nothing. The pilot
 * start-up check scans the built bundle to prove no demo code is left (apps/pilot/src/check.ts).
 */
import type { DemoSnapshot } from '@link/api-client/demo';

export const DemoControls = () => null;
export const DevIndex = () => null;
export const DevPanel = () => null;
export const DevSignIn = (props: { landing: string }) => (void props, null);
export const useDemoState = (): DemoSnapshot | null => null;
export const refreshDemoState = async () => {};
export const startMocks = async () => {};
export const TryBar = (props: { locale: string }) => (void props, null);
export const useTryOn = (): boolean => false;
export type TryRole = 'parent' | 'teacher' | 'owner';
/** No demo to reset in the pilot. */
export const resetTry = null as null | ((lang: string) => Promise<void>);
/** The pilot has no demo: the "try it" page says so (and is not served by the pilot server). */
export const startTry = null as
  null | ((input: { role: TryRole; lang: 'ar' | 'en' }) => Promise<string>);
