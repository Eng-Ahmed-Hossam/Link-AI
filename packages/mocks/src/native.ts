import { getResponse } from 'msw';
import { handlers } from './handlers';

/**
 * React Native / Expo web preview. MSW 3 ships no native entry and its node/browser entries
 * do not resolve under Metro, so we wrap `fetch` and route requests through MSW's core
 * `getResponse` with the same handlers the web app uses. Unmatched requests pass through.
 * Requests need an absolute URL (call `setApiBaseUrl('http://mock.link.test')`).
 * UNVERIFIED on a device until Batch 3.
 */
export function startMocks() {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const request = new Request(input as RequestInfo, init);
    const mocked = await getResponse(handlers, request);
    return mocked ?? realFetch(input as RequestInfo, init);
  };
}
