import { http, HttpResponse, delay } from 'msw';
import type { Page, TeacherSummary } from '@link/api-client';
import { teachers } from './fixtures';

/** Mock mode accepts this code for every phone number (task 3, "Mock flows"). */
export const MOCK_OTP = '123456';

export const handlers = [
  // GET /v1/search/teachers — example endpoint for Batch 0.
  http.get('*/v1/search/teachers', async ({ request }) => {
    const url = new URL(request.url);
    const radius = Number(url.searchParams.get('radiusKm') ?? 5);
    await delay(300);
    const items = teachers.filter((t) => t.distanceKm === null || t.distanceKm <= radius);
    const body: Page<TeacherSummary> = { items, nextCursor: null };
    return HttpResponse.json(body);
  }),
];
