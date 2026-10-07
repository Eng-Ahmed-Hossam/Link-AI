import type { MetadataRoute } from 'next';
import { PILOT } from '@/api-mode';
import { SITE_URL } from '@/site/meta';

/** Search engines may read the website; the app, the dev index and the API are not for them. */
export default function robots(): MetadataRoute.Robots {
  if (PILOT) return { rules: { userAgent: '*', disallow: '/' } };
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/ar/centre', '/en/centre', '/ar/dev', '/en/dev', '/ar/try', '/en/try'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
