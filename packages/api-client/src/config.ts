/** Client settings shared by every request (kept in its own module to avoid an import cycle). */
export const config = {
  baseUrl: '',
  locale: 'ar' as 'ar' | 'en',
  token: null as string | null,
  /**
   * How the session travels (07 §1): `bearer` (teacher app, mock modes) or `cookie` (the web in
   * live mode: httpOnly cookies, plus the `X-Link-Auth: cookie` header on every call).
   */
  auth: 'bearer' as 'bearer' | 'cookie',
  /** Bearer only: the refresh token, kept by the app in its secure storage. */
  refreshToken: null as string | null,
  /** Called with a rotated pair, so the app can store it (bearer). */
  onTokens: null as ((t: { accessToken: string; refreshToken: string }) => void) | null,
  /** Called when the session cannot be renewed: the app signs the person out. */
  onAuthLost: null as (() => void) | null,
};

export const setApiBaseUrl = (url: string) => {
  config.baseUrl = url.replace(/\/$/, '');
};
/** Absolute URL for a path on the current API (mock routes such as `/__mock/*` included). */
export const apiUrl = (path: string) => `${config.baseUrl}${path}`;
