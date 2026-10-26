import type { MetadataRoute } from 'next';

import { getBarangayIndex, getServices } from '@/lib/data';
import { NAV, SITE } from '@/lib/site';

/**
 * `/sitemap.xml`, generated from the same lists the site navigates by.
 *
 * Deliberately driven by `NAV` rather than a second hand-written list of routes: a page
 * added to the navigation is then in the sitemap the moment it exists, and one removed
 * from the nav cannot linger here as a 404 that crawlers keep retrying. `/hotlines` is
 * the one public page that lives only inside a nav GROUP, so it is added explicitly.
 *
 * What is left out, and why:
 *  - `/console/**` is the admin surface: behind a session, and never indexed.
 *  - `/report/track` and `/appointments/track` are lookup forms keyed by a reference code
 *    in the query string. They hold no content of their own and would index as an empty
 *    form, so they are not advertised.
 *  - `/api/**` is the JSON bridge, not a page.
 */
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${SITE.domain}`).replace(/\/$/, '');

const PRIORITY: Record<string, number> = {
  '/': 1,
  '/map': 0.9,
  '/barangays': 0.9,
  '/budget': 0.9,
  '/projects': 0.9,
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [barangays, services] = await Promise.all([getBarangayIndex(), getServices()]);

  const core: MetadataRoute.Sitemap = [
    ...NAV.map((item) => ({
      url: `${ORIGIN}${item.href === '/' ? '' : item.href}`,
      changeFrequency: 'weekly' as const,
      priority: PRIORITY[item.href] ?? 0.7,
    })),
    { url: `${ORIGIN}/hotlines`, changeFrequency: 'monthly' as const, priority: 0.8 },
  ];

  // A compiled dataset carries the moment it was refreshed, which is the honest
  // `lastModified` for a page that is rendered from it.
  const barangayBuilt = barangays?.generatedAt ? new Date(barangays.generatedAt) : undefined;
  const servicesBuilt = services?.generatedAt ? new Date(services.generatedAt) : undefined;

  const barangayPages: MetadataRoute.Sitemap = (barangays?.barangays ?? []).map((barangay) => ({
    url: `${ORIGIN}/barangays/${barangay.psgcCode}`,
    lastModified: barangayBuilt,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  const servicePages: MetadataRoute.Sitemap = (services?.categories ?? []).map((category) => ({
    url: `${ORIGIN}/services/${category.slug}`,
    lastModified: servicesBuilt,
    changeFrequency: 'monthly' as const,
    priority: 0.6,
  }));

  return [...core, ...barangayPages, ...servicePages];
}
