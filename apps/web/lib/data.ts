/**
 * Read-side access to the cached static data.
 *
 * SERVER ONLY. Every accessor is total: if the ETL has not been run yet, or a
 * source could not be fetched, the reader returns an empty value instead of
 * throwing, so `next build` cannot fail because an upstream host was down. Pages
 * then render a designed empty state that names the command to run.
 *
 * Nothing here performs a network request, and nothing here is imported by a
 * client component — the browser fetches these files from `/data/*` directly.
 */
import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  BarangayExposureRegistry,
  BarangayIndex,
  BarangayRecord,
  DatasetRegistry,
  FiscalSnapshot,
  HazardRegistry,
  LguDocumentIndex,
  LguRecord,
  MunicipalityProfile,
  ProjectRecord,
} from '@betterlabo/shared';

const DATA_DIR = join(process.cwd(), 'public', 'data');

type WithHash<T> = T & { dataHash?: string; generatedAt?: string };

async function readJson<T>(file: string): Promise<WithHash<T> | null> {
  try {
    return JSON.parse(await readFile(join(DATA_DIR, file), 'utf8')) as WithHash<T>;
  } catch {
    return null;
  }
}

export async function getProfile(): Promise<MunicipalityProfile | null> {
  return readJson<MunicipalityProfile>('profile.json');
}

export async function getBarangayIndex(): Promise<BarangayIndex | null> {
  return readJson<BarangayIndex>('barangays.json');
}

export async function getBarangay(psgcCode: string): Promise<BarangayRecord | null> {
  const index = await getBarangayIndex();
  return index?.barangays.find((b) => b.psgcCode === psgcCode) ?? null;
}

export async function getFiscal(): Promise<FiscalSnapshot | null> {
  return readJson<FiscalSnapshot>('fiscal.json');
}

export async function getProjects(): Promise<{ projects: ProjectRecord[] } | null> {
  return readJson<{ projects: ProjectRecord[] }>('projects.json');
}

export async function getHazards(): Promise<HazardRegistry | null> {
  return readJson<HazardRegistry>('hazards.json');
}

export async function getBarangayExposure(): Promise<BarangayExposureRegistry | null> {
  return readJson<BarangayExposureRegistry>('barangay-exposure.json');
}

export async function getDatasetRegistry(): Promise<DatasetRegistry | null> {
  return readJson<DatasetRegistry>('datasets.json');
}

/** Compiled from the Municipality of Labo's own website, via the Wayback Machine. */
export async function getLgu(): Promise<LguRecord | null> {
  return readJson<LguRecord>('lgu.json');
}

/** ~1,500 entries and ~660 KB — deliberately its own file, fetched only by /documents. */
export async function getLguDocuments(): Promise<LguDocumentIndex | null> {
  return readJson<LguDocumentIndex>('lgu-documents.json');
}

/** The public path (not the filesystem path) of a compiled data file. */
export function publicDataPath(file: string): string {
  return `/data/${file}`;
}

export const DATA_FILES = {
  barangayGeoJson: 'labo-barangays.geojson',
  municipalityGeoJson: 'labo-municipality.geojson',
  barangayIndex: 'barangays.json',
  profile: 'profile.json',
  fiscal: 'fiscal.json',
  projects: 'projects.json',
  lgu: 'lgu.json',
  lguDocuments: 'lgu-documents.json',
  hazards: 'hazards.json',
  barangayExposure: 'barangay-exposure.json',
  datasets: 'datasets.json',
} as const;

/** Shapes an empty state can point at, so the fix is always one command away. */
export const ETL_HINT = 'npm run etl all';
