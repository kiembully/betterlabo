/**
 * HTTP helpers for the ETL.
 *
 * THIS MODULE DELIBERATELY DOES NOT USE `fetch`.
 *
 * `blgf.gov.ph` sits behind a WAF that answers undici with
 * `NGHTTP2_PROTOCOL_ERROR: Stream closed with error code`, and answers a bare
 * request (no browser-ish headers) with 403. The same request over `node:https`
 * with HTTP/1.1, a realistic UA and a Referer returns 200 and the full workbook.
 * Every download here therefore goes through `node:https` with ALPN pinned to
 * `http/1.1`, plus:
 *   - a browser-like User-Agent and Referer,
 *   - manual redirect following (GitHub release assets redirect to a signed host),
 *   - resumable downloads, because HuggingFace egress measured ~0.05 MB/s from
 *     this network and a 138 MB hazard archive is a 45-minute transfer that will
 *     outlive a single job,
 *   - `Accept-Encoding: identity` first, with one retry negotiating gzip when a
 *     host rejects the uncompressed request.
 */
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { dirname } from 'node:path';
import { createGunzip, createInflate } from 'node:zlib';

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

const DEFAULT_TIMEOUT = Number(process.env.ETL_HTTP_TIMEOUT_MS ?? 900_000);
const MAX_REDIRECTS = 6;

export function log(...args) {
  console.log(`[etl]`, ...args);
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function headersFor(url, extra = {}) {
  const origin = originOf(url);
  return {
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    Connection: 'keep-alive',
    ...(origin ? { Referer: `${origin}/` } : {}),
    ...extra,
  };
}

export async function sha256File(path) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const s = createReadStream(path);
    s.on('data', (c) => hash.update(c));
    s.on('end', resolve);
    s.on('error', reject);
  });
  return hash.digest('hex');
}

export function sha256Buffer(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/** One HTTP/1.1 request, no redirect following. */
function requestOnce(url, { headers, timeout }) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('http://') ? http : https;
    const req = lib.request(
      url,
      {
        method: 'GET',
        headers,
        agent:
          lib === https
            ? new https.Agent({ keepAlive: false, ALPNProtocols: ['http/1.1'] })
            : undefined,
      },
      (res) => resolve(res),
    );
    req.setTimeout(timeout, () => {
      req.destroy(new Error(`Timed out after ${timeout} ms: ${url}`));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Follow redirects manually, then hand back a readable, decoded stream. */
async function open(url, opts = {}) {
  const { timeout = DEFAULT_TIMEOUT, extraHeaders = {}, range } = opts;
  let current = url;
  let headers = headersFor(current, { ...extraHeaders, ...(range ? { Range: range } : {}) });

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const res = await requestOnce(current, { headers, timeout });
    const status = res.statusCode ?? 0;

    if ([301, 302, 303, 307, 308].includes(status) && res.headers.location) {
      res.resume();
      current = new URL(res.headers.location, current).toString();
      // Redirected to a signed CDN host: keep the Range, drop the Referer.
      headers = headersFor(current, range ? { Range: range } : {});
      continue;
    }
    if (status === 403 && headers['Accept-Encoding'] === 'identity') {
      res.resume();
      headers = { ...headers, 'Accept-Encoding': 'gzip, deflate' };
      continue; // one retry that negotiates compression
    }
    if (status >= 400) {
      res.resume();
      throw new Error(`GET ${current} -> HTTP ${status} ${res.statusMessage ?? ''}`.trim());
    }

    const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
    const stream = encoding.includes('gzip')
      ? res.pipe(createGunzip())
      : encoding.includes('deflate')
        ? res.pipe(createInflate())
        : res;
    return { res, stream, finalUrl: current, status };
  }
  throw new Error(`Too many redirects for ${url}`);
}

export async function fetchBuffer(url, opts = {}) {
  const { stream } = await open(url, opts);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function fetchJson(url, opts) {
  return JSON.parse((await fetchBuffer(url, opts)).toString('utf8'));
}

/**
 * Download to `dest`, resuming a partial `.part` file across attempts.
 *
 * Streams to disk as it goes rather than buffering the whole body, so a dropped
 * connection costs only the bytes in flight and the retry resumes from what is
 * already on disk. That is not theoretical: the DPWH Parquet's transfer ended
 * early TWICE in one run ("end of response with 18547918 bytes missing", then
 * 8956777), and a buffer-then-write implementation would have discarded all of it
 * and started again. The final size is checked against the server's declared total
 * before the `.part` file is promoted, so a short transfer can never be mistaken
 * for a complete download — which matters because a truncated Parquet/zip reads
 * as corrupt data rather than as a network problem.
 *
 * Returns `{ path, bytes, sha256, skipped }`.
 */
export async function downloadToFile(url, dest, opts = {}) {
  const {
    force = false,
    timeout = DEFAULT_TIMEOUT,
    logEveryBytes = 8 * 1024 * 1024,
    extraHeaders = {},
    maxAttempts = 5,
  } = opts;
  await mkdir(dirname(dest), { recursive: true });

  if (!force && existsSync(dest)) {
    const { size } = await stat(dest);
    if (size > 0) return { path: dest, bytes: size, sha256: await sha256File(dest), skipped: true };
  }

  const part = `${dest}.part`;
  const name = dest.split(/[\\/]/).pop();
  if (force) await rm(part, { force: true });

  let expected = null;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let start = existsSync(part) ? (await stat(part)).size : 0;
    if (attempt > 1) {
      log(`retry ${attempt}/${maxAttempts} for ${name} — resuming at ${(start / 1e6).toFixed(1)} MB`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
    }

    try {
      const { res, stream, status } = await open(url, {
        timeout,
        extraHeaders,
        range: start > 0 ? `bytes=${start}-` : undefined,
      });

      const contentRange = res.headers['content-range'];
      const contentLength = Number(res.headers['content-length']);
      if (typeof contentRange === 'string' && contentRange.includes('/')) {
        const total = Number(contentRange.split('/')[1]);
        if (Number.isFinite(total)) expected = total;
      } else if (status === 200 && Number.isFinite(contentLength)) {
        expected = contentLength;
      } else if (status === 206 && Number.isFinite(contentLength) && start > 0) {
        expected = start + contentLength;
      }

      // The server ignored the Range header: the bytes on disk are not a prefix.
      const resumed = status === 206 && start > 0;
      if (!resumed && start > 0) {
        log(`${name}: server ignored the Range request — restarting the transfer`);
        await rm(part, { force: true });
        start = 0;
      }

      const out = createWriteStream(part, { flags: resumed ? 'a' : 'w' });
      let received = start;
      let lastLogged = received;
      for await (const chunk of stream) {
        if (!out.write(chunk)) {
          await once(out, 'drain');
        }
        received += chunk.length;
        if (received - lastLogged >= logEveryBytes) {
          lastLogged = received;
          log(`  \u2026${(received / 1e6).toFixed(1)} MB  ${name}`);
        }
      }
      out.end();
      await once(out, 'close');

      const { size } = await stat(part);
      if (expected != null && size !== expected) {
        throw new Error(
          `short transfer: ${size} of ${expected} bytes (${(expected - size) / 1e6} MB missing)`,
        );
      }

      await rename(part, dest);
      return { path: dest, bytes: size, sha256: await sha256File(dest), skipped: false };
    } catch (err) {
      lastError = err;
      // The `.part` file is deliberately left in place: it is what the next
      // attempt resumes from.
      log(`${name}: ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error(
    `download failed after ${maxAttempts} attempts: ${lastError instanceof Error ? lastError.message : lastError}`,
  );
}

/** Total size of a remote file, read from a one-byte range request. */
export async function contentLength(url, opts = {}) {
  const { res } = await open(url, { ...opts, extraHeaders: { Range: 'bytes=0-0' } });
  const range = res.headers['content-range'];
  res.resume();
  if (typeof range === 'string' && range.includes('/')) {
    const total = Number(range.split('/')[1]);
    if (Number.isFinite(total)) return total;
  }
  const len = Number(res.headers['content-length']);
  return Number.isFinite(len) ? len : null;
}

/**
 * An async byte source for hyparquet that reads Parquet over HTTP range
 * requests, so the ETL fetches only the column chunks it actually projects
 * instead of the whole 24 MB (or 115 MB) file.
 */
export async function rangeFileForParquet(url, opts = {}) {
  const length = await contentLength(url, opts);
  if (length == null) throw new Error(`Cannot determine the size of ${url}`);
  return {
    byteLength: length,
    async slice(start, end) {
      const buf = await fetchBuffer(url, {
        ...opts,
        extraHeaders: {
          ...(opts.extraHeaders ?? {}),
          Range: `bytes=${start}-${end - 1}`,
        },
      });
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
}

/** Tiny concurrency-limited map — keeps the xlsx fan-out polite. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}
