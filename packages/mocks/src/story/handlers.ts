import { http, HttpResponse } from 'msw';
import { MockProblem } from '../db';
import { problem } from '../http';
import * as story from './story';

const call =
  (fn: (body: Record<string, unknown>) => unknown) =>
  async ({ request }: { request: Request }) => {
    const body = request.method === 'GET' ? {} : await request.json().catch(() => ({}));
    try {
      return HttpResponse.json(fn(body as Record<string, unknown>) as Record<string, unknown>);
    } catch (e) {
      if (e instanceof MockProblem) return problem(e.status, e.code, e.detail);
      throw e;
    }
  };

/** The connected story's Demo controls (Step 2B): dev only, like every `/__demo/*` call. */
export const storyHandlers = [
  http.get(
    '*/__demo/story',
    call(() => story.storyState()),
  ),
  http.post(
    '*/__demo/story/reset',
    call(() => story.resetStory()),
  ),
  http.post(
    '*/__demo/story/jump',
    call((b) => story.jumpToStep(Number(b.step))),
  ),
  http.post(
    '*/__demo/story/session-done',
    call(() => story.simulateSessionDone()),
  ),
  http.post(
    '*/__demo/story/extra',
    call((b) => story.setStoryExtra(b.on === true)),
  ),
];
