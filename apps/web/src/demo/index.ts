/**
 * Everything dev- and demo-only in the web app, behind one entry (`@demo`). Pilot builds
 * (NEXT_PUBLIC_LINK_MODE=pilot) alias `@demo` to `./pilot.ts`, so none of this — the Demo controls,
 * the dev panel, the MSW worker, the sample sign-in buttons — is compiled into the pilot bundle.
 */
export { DemoControls } from './DemoControls';
export { DevPanel } from './DevPanel';
export { DevSignIn } from './DevSignIn';
export { refreshDemoState, useDemoState } from './demo-state';

/** The MSW worker for `mock` mode. */
export const startMocks = () => import('@link/mocks/browser').then((m) => m.startMocks());
