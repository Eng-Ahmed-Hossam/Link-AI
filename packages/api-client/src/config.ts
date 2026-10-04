/** Client settings shared by every request (kept in its own module to avoid an import cycle). */
export const config = { baseUrl: '', locale: 'ar' as 'ar' | 'en', token: null as string | null };

export const setApiBaseUrl = (url: string) => {
  config.baseUrl = url.replace(/\/$/, '');
};
/** Absolute URL for a path on the current API (mock routes such as `/__mock/*` included). */
export const apiUrl = (path: string) => `${config.baseUrl}${path}`;
