/**
 * Path resolution for the ETL. Everything is anchored to the repo root so the
 * scripts behave identically when run from CI, from the repo root, or from
 * `tools/etl`.
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url)); // tools/etl/src/lib

/** Walks up until it finds the directory holding both package.json and apps/. */
function findRepoRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'apps'))) return dir;
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Could not locate the repo root above ${start}`);
}

export const repoRoot = findRepoRoot(here);

/** Where the Next app serves static data from. Committed to git. */
export const publicDataDir = join(repoRoot, 'apps', 'web', 'public', 'data');

/** Raw upstream downloads. Git-ignored, safe to delete. */
export const cacheDir = process.env.ETL_CACHE_DIR
  ? resolve(repoRoot, process.env.ETL_CACHE_DIR)
  : join(repoRoot, 'data', 'sources');

/** Intermediate, human-reviewable extracts (git-ignored). */
export const workDir = join(cacheDir, '_work');

export const paths = {
  repoRoot,
  publicDataDir,
  cacheDir,
  workDir,
  barangayIndex: join(publicDataDir, 'barangays.json'),
  barangayGeoJson: join(publicDataDir, 'labo-barangays.geojson'),
  municipalityGeoJson: join(publicDataDir, 'labo-municipality.geojson'),
  profile: join(publicDataDir, 'profile.json'),
  fiscal: join(publicDataDir, 'fiscal.json'),
  projects: join(publicDataDir, 'projects.json'),
  lgu: join(publicDataDir, 'lgu.json'),
  lguDocuments: join(publicDataDir, 'lgu-documents.json'),
  hazards: join(publicDataDir, 'hazards.json'),
  datasets: join(publicDataDir, 'datasets.json'),
};

export function rel(absPath) {
  return absPath.slice(repoRoot.length + 1).replaceAll('\\', '/');
}
