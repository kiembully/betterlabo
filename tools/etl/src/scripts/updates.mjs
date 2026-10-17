/**
 * Compile the municipality's own news posts into cached JSON.
 *
 * WHY THE REST API AND NOT THE PAGES
 *
 * labo.gov.ph answers every path behind a Cloudflare interactive challenge, so the
 * site is read only through dated Wayback snapshots. Scraping the rendered pages
 * would mean parsing a theme and guessing at dates. The site is WordPress, and its
 * REST API is archived too — `/wp-json/wp/v2/posts/<id>` snapshots run right up to
 * 2026, each one a clean record carrying an authoritative `date`, `link`, title and
 * excerpt. So we read the API.
 *
 * THE SPAM PROBLEM — THIS IS NOT A NORMAL NEWS FEED
 *
 * This WordPress install has been abused: alongside genuine LGU posts sit injected
 * SEO spam ("16-ideal-bitcoin-crypto-casinos-usa…", "bukmacher…", "plinko…") and
 * dozens of WordPress auto-drafts ("17728-2-copy-copy"). An unfiltered feed would
 * publish "best crypto casino" to citizens under the municipality's name. So posts
 * are filtered by an explicit, auditable blocklist and every exclusion is counted.
 * The blocklist is deliberately conservative and lives here, in the open, rather
 * than behind a heuristic nobody can inspect.
 *
 * Anything this cannot classify is EXCLUDED, not guessed at: a wrong headline is
 * worse than a missing one on a transparency portal.
 */
import { fetchSnapshot, listSnapshots, snapshotIso } from '../lib/wayback.mjs';
import { cacheDir, paths } from '../lib/paths.mjs';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordProvenance } from '../lib/registry.mjs';
import { writeStableJson } from '../lib/write.mjs';
import { log } from '../lib/http.mjs';

const HOST = 'https://labo.gov.ph';
const API = `${HOST}/wp-json/wp/v2/posts`;

/**
 * Injected content and non-news noise.
 *
 * Kept as plain substrings so the rule that excluded a post can be printed and
 * argued with. Every one of these was seen in the archive index of this site.
 */
const SPAM_TERMS = [
  'bitcoin', 'crypto', 'casino', 'casumo', 'slingo', 'plinko', 'bukmacher',
  'bukmeker', 'parimatch', '1xbet', 'vulkanbet', 'mr-green', 'bahis', 'azrbaycan',
  'zgarnij', 'otzyvy', 'karty-do-gry', 'ice-casino', 'isrobloxsafe', 'roblox',
  'supercat', 'how-to-calcu', '8-ways-to-cr', 'xyhetorax', 'qw1-jpg', 'qw2-jpg',
  'qw3-jpg', 'qw4-jpg', 'qw5-jpg', 'qw6-jpg', 'all-right-casino', '4500-9',
];

/** WordPress auto-drafts and page-builder leftovers that are not editorial content. */
function isAutoDraft(slug) {
  return (
    /-(copy|copy-\d+|\d+)$/i.test(slug) ||
    /^page-\d+$/.test(slug) ||
    /^\d+$/.test(slug) ||
    /-jpg$/.test(slug) ||
    /^\d{4}-\d{2}-\d{2}/.test(slug)
  );
}

function exclusionReason(slug, title) {
  const haystack = `${slug} ${title}`.toLowerCase();
  const term = SPAM_TERMS.find((t) => haystack.includes(t));
  if (term) return `spam:${term}`;
  if (isAutoDraft(slug)) return 'auto-draft';
  return null;
}

const CDX_CACHE = join(cacheDir, 'labo-cdx-index.json');

/**
 * The archived post IDs, from the Wayback CDX index.
 *
 * The index is cached on disk and reused, because it rate-limits hard: a burst of
 * queries earns a 503 carrying an HTML error page, which is what a naive re-query
 * on every build produces. Discovery is a once-in-a-while operation and a rerun of
 * this task should not repeat it. `--force` refreshes the index.
 */
async function cdxIndex(force) {
  if (!force && existsSync(CDX_CACHE)) {
    const cached = JSON.parse(readFileSync(CDX_CACHE, 'utf8'));
    log(`updates: reusing the cached CDX index from ${cached.fetchedAt}`);
    return cached.urls;
  }

  const query =
    'url=labo.gov.ph/wp-json/wp/v2/posts/*&output=json&limit=2000&fl=original,timestamp&collapse=urlkey';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const res = await fetch(`https://web.archive.org/cdx/search/cdx?${query}`, {
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      // The index answers 503 with an HTML error page rather than JSON.
      if (!res.ok || text.trimStart().startsWith('<')) {
        throw new Error(`HTTP ${res.status} (index busy)`);
      }
      const rows = JSON.parse(text);
      const urls = rows.slice(1).map(([u, t]) => ({ u, t }));
      mkdirSync(cacheDir, { recursive: true });
      writeFileSync(CDX_CACHE, JSON.stringify({ fetchedAt: new Date().toISOString(), urls }), 'utf8');
      return urls;
    } catch (err) {
      if (attempt === 7) throw err;
      const wait = 5000 * (attempt + 1);
      log(`updates: CDX unavailable (${err.message}); retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return [];
}

function postIds(urls) {
  const ids = new Set();
  for (const { u } of urls) {
    const match = /\/wp-json\/wp\/v2\/posts\/(\d+)(?:%3E;)?$/.exec(u);
    if (match) ids.add(Number(match[1]));
  }
  // Newest IDs first: WordPress allocates them in order, so this is the closest
  // thing to a recency ordering without fetching every single one.
  return [...ids].sort((a, b) => b - a);
}

function plain(html) {
  return String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#8217;|&#039;|&rsquo;/g, '’')
    .replace(/&#8220;|&#8221;|&quot;/g, '"')
    .replace(/&#8211;|&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function run(ctx = {}) {
  // ctx.force / ctx.cachedOnly are accepted but not needed: every request here is
  // already served from the snapshot cache when present.
  void ctx;

  const MAX_POSTS = Number(process.env.ETL_UPDATES_MAX_POSTS ?? 90);

  const allIds = postIds(await cdxIndex(Boolean(ctx.force)));
  const ids = allIds.slice(0, MAX_POSTS);
  log(
    `updates: ${allIds.length} archived post ids; fetching the newest ${ids.length}` +
      ' (set ETL_UPDATES_MAX_POSTS to change)',
  );

  const posts = [];
  const excluded = [];
  const unreachable = [];

  for (const id of ids) {
    const url = `${API}/${id}`;
    let snapshot;
    try {
      snapshot = await fetchSnapshot(url, { minBytes: 200 });
    } catch (err) {
      unreachable.push({ id, reason: err.message });
      continue;
    }
    if (!snapshot) {
      unreachable.push({ id, reason: 'no usable snapshot' });
      continue;
    }

    let record;
    try {
      record = JSON.parse(snapshot.html);
    } catch {
      unreachable.push({ id, reason: 'snapshot was not JSON' });
      continue;
    }
    if (record.code || !record.date || !record.title?.rendered) {
      unreachable.push({ id, reason: record.code ?? 'unexpected payload' });
      continue;
    }

    const slug = record.slug ?? '';
    const title = plain(record.title.rendered);
    const reason = exclusionReason(slug, title);
    if (reason) {
      excluded.push({ id, slug, reason });
      continue;
    }

    const media = record._links?.['wp:featuredmedia']?.[0]?.href;
    posts.push({
      id,
      slug,
      title,
      date: record.date,
      // The LGU's own canonical link, not the archive's.
      url: record.link ?? `${HOST}/${slug}/`,
      excerpt: plain(record.excerpt?.rendered).slice(0, 320) || null,
      featuredMediaUrl: media ?? null,
      archivedAt: snapshotIso(snapshot.timestamp),
      categoryIds: record.categories ?? [],
    });
  }

  posts.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  const byYear = {};
  for (const p of posts) {
    const year = p.date.slice(0, 4);
    byYear[year] = (byYear[year] ?? 0) + 1;
  }

  const payload = {
    municipality: 'Labo',
    province: 'Camarines Norte',
    note:
      'News posts published by the Municipality of Labo on its own website, read through ' +
      'the site’s WordPress REST API as archived by the Internet Archive. Posts matching ' +
      'the injection blocklist are excluded; see `excluded` for every omission and its reason.',
    source: {
      host: HOST,
      api: API,
      canonical: 'https://labo.gov.ph/news/',
      facebook: 'https://www.facebook.com/LGULaboCamNorte',
      protocol: 'Wayback Machine snapshots of the WordPress REST API (the live host challenges scripts)',
    },
    count: posts.length,
    byYear,
    excludedCount: excluded.length,
    unreachableCount: unreachable.length,
    excluded,
    unreachable: unreachable.slice(0, 40),
    items: posts,
    generatedAt: new Date().toISOString(),
  };

  await writeStableJson(paths.lguUpdates, payload);

  await recordProvenance({
    id: 'labo-lgu-updates',
    title: 'Municipality of Labo — news posts (WordPress REST API, via Wayback Machine)',
    publisher: 'Municipality of Labo, Camarines Norte (labo.gov.ph)',
    sourceUrl: `${API}`,
    outputs: ['apps/web/public/data/lgu-updates.json'],
    license: 'Public domain (Philippine government work)',
    retrievedAt: new Date().toISOString(),
    note: `${posts.length} posts compiled, ${excluded.length} excluded by the injection blocklist.`,
  });

  log(
    `updates: ${posts.length} posts kept, ${excluded.length} excluded, ` +
      `${unreachable.length} unreachable → ${paths.lguUpdates}`,
  );
  log(`  by year: ${JSON.stringify(byYear)}`);
  log(`  newest: ${posts.slice(0, 3).map((p) => `${p.date.slice(0, 10)} ${p.slug}`).join(' | ') || '(none)'}`);
  log(`  exclusions by reason: ${JSON.stringify(
    excluded.reduce((acc, e) => ({ ...acc, [e.reason]: (acc[e.reason] ?? 0) + 1 }), {}),
  )}`);
}
