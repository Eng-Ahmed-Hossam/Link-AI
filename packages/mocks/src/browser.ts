import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

export const worker = setupWorker(...handlers);

/** Start the browser worker. Needs `mockServiceWorker.js` in the app's public folder (`pnpm msw:init`). */
export const startMocks = () => worker.start({ onUnhandledFrame: 'bypass', quiet: true });
