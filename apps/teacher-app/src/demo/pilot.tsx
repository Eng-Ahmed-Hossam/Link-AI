/**
 * `@/demo` in pilot builds (metro.config.js): the same names, doing nothing. The pilot start-up check
 * scans the exported bundle to prove no demo code is left (apps/pilot/src/check.ts).
 */
import type { DemoSnapshot } from '@link/api-client/demo';
import type { Session } from '../session';

export const startMocks = () => {};
export const SAMPLE_TEACHER = null as Session | null;
export const DemoControls = () => null;
export const useDemoState = (): DemoSnapshot | null => null;
export const refreshDemoState = async () => {};
export const TryBanner = () => null;
export const startTeacherTry = null as null | ((lang: 'ar' | 'en') => Promise<void>);
export const teacherTryOn = () => false;
