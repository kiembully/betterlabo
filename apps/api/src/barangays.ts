/**
 * The barangay registry.
 *
 * Report intake needs a name for a PSGC code, and the ETL already compiles that
 * index for the portal (`apps/web/public/data/barangays.json`). The API reads
 * that file rather than duplicating 52 names it would then have to keep in sync.
 * When the file is absent the registry is empty and the API degrades honestly:
 * it stops enforcing membership and stores the PSGC code as the barangay name
 * instead of inventing one.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BarangayRecord } from '@betterlabo/shared';
import { REPO_ROOT } from './env.js';
import { errorMessage, log } from './logger.js';

export interface BarangayRegistry {
  /** Number of barangays loaded. `0` means the compiled index was not found. */
  readonly size: number;
  /** Absolute path the records came from, or `null`. */
  readonly source: string | null;
  get(psgcCode: string): BarangayRecord | null;
  has(psgcCode: string): boolean;
  all(): readonly BarangayRecord[];
}

interface NamedRecord {
  psgcCode: string;
  name: string;
  isPoblacion?: boolean;
  [key: string]: unknown;
}

function candidatePaths(): string[] {
  const override = process.env['BARANGAYS_PATH'];
  const paths: string[] = [];
  if (typeof override === 'string' && override.trim() !== '') paths.push(override.trim());
  if (REPO_ROOT) {
    paths.push(join(REPO_ROOT, 'apps', 'web', 'public', 'data', 'barangays.json'));
    paths.push(join(REPO_ROOT, 'public', 'data', 'barangays.json'));
  }
  return paths;
}

function readRecords(file: string): NamedRecord[] | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    const list = (parsed as { barangays?: unknown }).barangays;
    if (!Array.isArray(list)) return null;
    const records: NamedRecord[] = [];
    for (const entry of list) {
      if (typeof entry !== 'object' || entry === null) continue;
      const candidate = entry as { psgcCode?: unknown; name?: unknown };
      if (typeof candidate.psgcCode !== 'string' || typeof candidate.name !== 'string') continue;
      records.push(entry as NamedRecord);
    }
    return records.length > 0 ? records : null;
  } catch (err) {
    log.debug('barangay index not readable', { file, error: errorMessage(err) });
    return null;
  }
}

function buildRegistry(records: NamedRecord[], source: string | null): BarangayRegistry {
  const byCode = new Map<string, BarangayRecord>();
  for (const record of records) {
    byCode.set(record.psgcCode, record as unknown as BarangayRecord);
  }
  const all = [...byCode.values()];
  return {
    size: byCode.size,
    source,
    get: (psgcCode: string) => byCode.get(psgcCode) ?? null,
    has: (psgcCode: string) => byCode.has(psgcCode),
    all: () => all,
  };
}

export function createBarangayRegistry(): BarangayRegistry {
  for (const file of candidatePaths()) {
    const records = readRecords(file);
    if (records) return buildRegistry(records, file);
  }
  log.warn(
    'no barangay index found — report intake will not verify barangay PSGC codes against the municipality',
  );
  return buildRegistry([], null);
}

let cached: BarangayRegistry | null = null;

/** Process-wide registry, loaded on first use. */
export function getDefaultRegistry(): BarangayRegistry {
  cached ??= createBarangayRegistry();
  return cached;
}
