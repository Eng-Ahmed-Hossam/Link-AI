import { useQuery } from '@tanstack/react-query';
import type { Page, ProblemDetails, SearchTeachersQuery, TeacherSummary } from './types';

export * from './types';

export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.title);
  }
}

let baseUrl = '';
export const setApiBaseUrl = (url: string) => {
  baseUrl = url.replace(/\/$/, '');
};

async function get<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v));
  const res = await fetch(`${baseUrl}${path}${qs.size ? `?${qs}` : ''}`, {
    headers: { accept: 'application/json' },
  });
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as ProblemDetails | null;
    throw new ApiError(
      problem ?? {
        type: 'about:blank',
        title: res.statusText,
        status: res.status,
        code: 'unknown',
      },
    );
  }
  return (await res.json()) as T;
}

export const searchTeachers = (q: SearchTeachersQuery = {}) =>
  get<Page<TeacherSummary>>('/v1/search/teachers', { ...q });

export const queryKeys = {
  searchTeachers: (q: SearchTeachersQuery) => ['search', 'teachers', q] as const,
};

export const useSearchTeachers = (q: SearchTeachersQuery = {}) =>
  useQuery({ queryKey: queryKeys.searchTeachers(q), queryFn: () => searchTeachers(q) });
