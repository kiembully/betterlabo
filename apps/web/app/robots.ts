import type { MetadataRoute } from 'next';

import { SITE } from '@/lib/site';

/**
 * `/robots.txt`.
 *
 * The public portal is meant to be crawled — it is a transparency project, and a page
 * nobody can find is a page that failed. Two surfaces are excluded:
 *
 *  - `/console/**` is the admin console: behind a session cookie, and it must not appear
 *    in a search result even as a bare login screen.
 *  - `/api/**` is the JSON bridge the pages call. Every figure it returns is already on a
 *    page in HTML, so indexing it adds duplicate content and nothing else.
 *
 * `sitemap` is the point of the file as much as the crawl rules are: it is how a crawler
 * that has never seen this site discovers the generated `/sitemap.xml` at all.
 */
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${SITE.domain}`).replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/console', '/console/', '/api/'] }],
    sitemap: `${ORIGIN}/sitemap.xml`,
    host: ORIGIN,
  };
}
