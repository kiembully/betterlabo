/**
 * Provenance bookkeeping.
 *
 * Entries accumulate in the git-ignored cache between individual task runs, so
 * `etl barangays` followed by `etl fiscal` still produces a complete
 * `datasets.json`. `etl all` rebuilds the registry from a clean slate.
 *
 * A source that could not be fetched in a run is recorded with
 * `unavailable: true` rather than being dropped — a citation that silently
 * disappears is worse than a citation that admits it is missing.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { paths } from './paths.mjs';

function registryFile() {
  return join(paths.workDir, 'registry.json');
}

export async function recordProvenance(entry) {
  await mkdir(paths.workDir, { recursive: true });
  let current = [];
  try {
    current = JSON.parse(await readFile(registryFile(), 'utf8'));
  } catch {
    current = [];
  }
  const next = current.filter((e) => e.id !== entry.id);
  next.push(entry);
  next.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(registryFile(), JSON.stringify(next, null, 2), 'utf8');
  return entry;
}

export async function readRegistry() {
  try {
    return JSON.parse(await readFile(registryFile(), 'utf8'));
  } catch {
    return [];
  }
}

export async function resetRegistry() {
  await mkdir(paths.workDir, { recursive: true });
  await writeFile(registryFile(), '[]', 'utf8');
}

/** Record a source as unreachable without aborting the whole run. */
export async function recordUnavailable(source, reason) {
  return recordProvenance({
    id: source.id,
    title: source.title,
    publisher: source.publisher,
    portalDatasetId: source.portalDatasetId ?? null,
    portalUrl: source.portalUrl,
    sourceUrl: source.sourceUrl ?? source.portalUrl,
    license: source.license,
    licenseUrl: source.licenseUrl ?? null,
    attributionText: source.attributionText ?? '',
    retrievedAt: new Date().toISOString(),
    sourceVersion: source.sourceVersion ?? null,
    rowCount: null,
    bytes: null,
    sha256: null,
    outputs: [],
    notes: `Not compiled in this run: ${reason}`,
    unavailable: true,
  });
}
