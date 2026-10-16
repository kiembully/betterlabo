/**
 * Wayback Machine fetcher, for hosts that cannot be reached directly.
 *
 * `labo.gov.ph` sits behind a Cloudflare interactive challenge: a plain request
 * gets `403` with `Cf-Mitigated: challenge` and a "Just a moment..." body, and so
 * do `/robots.txt`, `/sitemap.xml` and `/wp-json/...` — the whole HTML surface is
 * gated, so there is no API-first pivot to take. Archived snapshots are the
 * workable route, and they have the side benefit of being timestamped, which is
 * exactly the provenance a scrubbed government site needs.
 *
 * Two traps this module exists to avoid:
 *
 *  1. **Archived challenge pages.** The Archive happily captures Cloudflare's
 *     "One moment, please… Loader" interstitial, and serves it with `200`. A
 *     naive fetch returns a small HTML file that parses to nothing and looks like
 *     "the page is empty" rather than "the capture is useless". Every candidate is
 *     therefore screened for challenge markers before it is accepted.
 *  2. **CDX 503s.** The index endpoint intermittently returns 503 under load, and
 *     an empty response parses as "no snapshots exist". Retries are built in so a
 *     transient failure never reads as a missing source.
 *
 * Raw captures are cached under `data/sources/_wayback/` so re-runs are cheap and
 * `--cached-only` works offline.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { paths } from './paths.mjs';

const CDX = 'https://web.archive.org/cdx/search/cdx';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** Markers of an archived Cloudflare interstitial rather than real content. */
const CHALLENGE_MARKERS = [
  'just a moment',
  'one moment, please',
  'enable javascript and cookies',
  '_cf_chl_opt',
  'cf-browser-verification',
  'checking your browser',
];

export function isChallengePage(html) {
  const head = html.slice(0, 4000).toLowerCase();
  return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

/** Layout furniture that every page repeats; never content. */
export function stripChrome(html) {
  return html
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
}

function decodeEntities(text) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '\u2013',
    mdash: '\u2014', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
    hellip: '\u2026', times: '\u00d7', deg: '\u00b0',
  };
  return text
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

/**
 * All snapshots of a URL, oldest first: `[{ timestamp, status, length }]`.
 * Retries because the CDX endpoint 503s under load — and an empty answer would
 * otherwise be indistinguishable from "never archived".
 */
export async function listSnapshots(url, { limit = 80, retries = 4 } = {}) {
  const query =
    `${CDX}?url=${encodeURIComponent(url)}&output=json&limit=${limit}` +
    '&fl=original,timestamp,statuscode,length';
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(query, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.text();
      if (!body.trim().startsWith('[')) throw new Error(`CDX returned ${res.status}`);
      const rows = JSON.parse(body);
      return rows.slice(1).map(([original, timestamp, status, length]) => ({
        url: original,
        timestamp,
        status,
        length: Number(length) || 0,
      }));
    } catch {
      if (attempt === retries) return [];
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  return [];
}

async function readOrFetch(url, timestamp, cachePath, { force }) {
  if (!force && existsSync(cachePath)) {
    return { html: await readFile(cachePath, 'utf8'), fromCache: true };
  }
  // `id_` returns the original bytes without the Wayback toolbar injected.
  const raw = `https://web.archive.org/web/${timestamp}id_/${url}`;
  const res = await fetch(raw, {
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`snapshot ${timestamp} returned HTTP ${res.status}`);
  const html = await res.text();
  await mkdir(join(paths.cacheDir, '_wayback'), { recursive: true });
  await writeFile(cachePath, html, 'utf8');
  return { html, fromCache: false };
}

/**
 * The newest usable snapshot of a URL.
 *
 * Walks snapshots newest-first and returns the first one that is (a) a 200, (b)
 * big enough to hold real content, (c) not an archived challenge page, and (d)
 * satisfies `accept` when given. `accept` is how a caller asks for the newest
 * capture that actually contains something specific — used for pages whose
 * current version has had names removed.
 *
 * @returns {{html: string, timestamp: string, fromCache: boolean}|null}
 */
export async function fetchSnapshot(url, options = {}) {
  const {
    slug,
    minBytes = 4000,
    force = false,
    cachedOnly = false,
    accept = null,
    maxCandidates = 8,
  } = options;

  const snapshots = await listSnapshots(url);
  if (snapshots.length === 0) {
    // No index (offline, or CDX down): fall back to any cached capture we hold.
    const cached = await newestCached(slug);
    return cached;
  }

  let considered = 0;
  for (const snap of snapshots.slice().reverse()) {
    if (snap.status !== '200' || snap.length < minBytes) continue;
    if (considered >= maxCandidates) break;
    considered += 1;

    const cachePath = cachedPath(slug, snap.timestamp);
    let result;
    try {
      result = await readOrFetch(url, snap.timestamp, cachePath, { force });
    } catch {
      continue;
    }
    if (isChallengePage(result.html)) continue;
    if (accept && !accept(result.html)) continue;
    return { html: result.html, timestamp: snap.timestamp, fromCache: result.fromCache };
  }

  if (!cachedOnly) {
    // Every recent capture was junk or off-pattern — try older, uncounted ones.
    for (const snap of snapshots.slice().reverse()) {
      if (snap.status !== '200') continue;
      const cachePath = cachedPath(slug, snap.timestamp);
      try {
        const result = await readOrFetch(url, snap.timestamp, cachePath, { force });
        if (isChallengePage(result.html)) continue;
        if (accept && !accept(result.html)) continue;
        return { html: result.html, timestamp: snap.timestamp, fromCache: result.fromCache };
      } catch {
        continue;
      }
    }
  }

  return newestCached(slug, accept);
}

function cachedPath(slug, timestamp) {
  return join(paths.cacheDir, '_wayback', `${slug}-${timestamp}.html`);
}

/** Newest already-cached capture for a slug, when the network is not an option. */
async function newestCached(slug, accept = null) {
  const { readdir } = await import('node:fs/promises');
  const dir = join(paths.cacheDir, '_wayback');
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return null;
  }
  const mine = names
    .filter((n) => n.startsWith(`${slug}-`) && n.endsWith('.html'))
    .map((n) => ({ name: n, timestamp: n.slice(slug.length + 1, -'.html'.length) }))
    .filter((x) => /^\d{14}$/.test(x.timestamp))
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  for (const entry of mine) {
    const html = await readFile(join(dir, entry.name), 'utf8');
    if (isChallengePage(html)) continue;
    if (accept && !accept(html)) continue;
    return { html, timestamp: entry.timestamp, fromCache: true };
  }
  return null;
}

/** Readable text lines of an HTML document, one per source line. */
export function htmlToLines(html) {
  const body = stripChrome(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|td|th|span|section|article|header|footer)>/gi, '\n')
    .replace(/<[^>]+>/g, '\n');
  return decodeEntities(body)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

/** `20260201231646` → `2026-02-01`. */
export function snapshotDate(timestamp) {
  if (!/^\d{14}$/.test(timestamp ?? '')) return null;
  return `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}`;
}

/** `20260201231646` → `2026-02-01T23:16:46Z`. */
export function snapshotIso(timestamp) {
  if (!/^\d{14}$/.test(timestamp ?? '')) return null;
  const [y, mo, d, h, mi, s] = [
    timestamp.slice(0, 4), timestamp.slice(4, 6), timestamp.slice(6, 8),
    timestamp.slice(8, 10), timestamp.slice(10, 12), timestamp.slice(12, 14),
  ];
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

/** The snapshot's canonical Wayback permalink, for citations. */
export function snapshotUrl(url, timestamp) {
  return `https://web.archive.org/web/${timestamp}/${url}`;
}
