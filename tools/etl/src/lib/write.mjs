/**
 * Deterministic writers.
 *
 * `generatedAt` is the enemy of a clean diff: a nightly cron that re-runs the
 * ETL against unchanged upstream data would otherwise produce a commit a day.
 * `writeStableJson` stores a `dataHash` of the payload *without* the timestamp
 * and keeps the previous `generatedAt` when the hash is unchanged, so a refresh
 * only touches files whose content actually moved.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { log } from './http.mjs';
import { rel } from './paths.mjs';

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

export function hashPayload(value) {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

async function readExisting(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @returns {{ path: string, changed: boolean, hash: string, bytes: number }}
 */
export async function writeStableJson(path, payload, { pretty = true } = {}) {
  await mkdir(dirname(path), { recursive: true });
  const hash = hashPayload(payload);
  const existing = await readExisting(path);

  if (existing && existing.dataHash === hash) {
    log(`unchanged ${rel(path)}`);
    return { path, changed: false, hash, bytes: 0 };
  }

  const generatedAt =
    existing && existing.dataHash === hash ? existing.generatedAt : new Date().toISOString();
  const out = { ...payload, dataHash: hash, generatedAt: existing?.generatedAt && existing.dataHash === hash ? existing.generatedAt : generatedAt };
  const text = pretty ? `${JSON.stringify(out, null, 2)}\n` : JSON.stringify(out);
  await writeFile(path, text, 'utf8');
  log(`wrote ${rel(path)} (${(text.length / 1024).toFixed(1)} KB)`);
  return { path, changed: true, hash, bytes: text.length };
}

/** GeoJSON is always minified — this is the file the browser downloads. */
export async function writeGeoJson(path, geojson) {
  await mkdir(dirname(path), { recursive: true });
  const text = `${JSON.stringify(geojson)}\n`;
  const hash = createHash('sha256').update(text).digest('hex');
  const existing = await readExistingHashCache(path);
  if (existing === hash) {
    log(`unchanged ${rel(path)}`);
    return { path, changed: false, bytes: text.length, hash };
  }
  await writeFile(path, text, 'utf8');
  await writeFile(`${path}.sha256`, `${hash}\n`, 'utf8');
  log(`wrote ${rel(path)} (${(text.length / 1024).toFixed(1)} KB, minified)`);
  return { path, changed: true, bytes: text.length, hash };
}

async function readExistingHashCache(path) {
  try {
    const { createHash: ch } = await import('node:crypto');
    const txt = await readFile(path, 'utf8');
    return ch('sha256').update(txt).digest('hex');
  } catch {
    return null;
  }
}

export async function writeText(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf8');
}
