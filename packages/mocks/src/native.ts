import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

/** React Native: MSW 3 has no `msw/native` entry; this uses the node entry, which intercepts fetch. UNVERIFIED on a device until Batch 3. */
export const startMocks = () => server.listen({ onUnhandledFrame: 'bypass' });
