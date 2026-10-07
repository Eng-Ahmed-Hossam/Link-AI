import type { MetadataRoute } from 'next';
import { PILOT } from '@/api-mode';
import { SITE_URL } from '@/site/meta';

/** The website pages, each with its other-language twin. */
export default function sitemap(): MetadataRoute.Sitemap {
  if (PILOT) return [];
  return ['', '/pilot', '/sign-in'].flatMap((path) =>
    (['ar', 'en'] as const).map((lang) => ({
      url: `${SITE_URL}/${lang}${path}`,
      changeFrequency: 'monthly' as const,
      priority: path ? 0.5 : 1,
      alternates: { languages: { ar: `${SITE_URL}/ar${path}`, en: `${SITE_URL}/en${path}` } },
    })),
  );
}
