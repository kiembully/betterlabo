/**
 * Environment loading.
 *
 * The API owns no dotenv dependency. It walks up from its own module URL until
 * it finds the directory that holds both `package.json` and `apps/` — the repo
 * root — and loads that `.env.local` with `process.loadEnvFile`. A missing file
 * is not an error: every value below has a working default, and `.env.example`
 * at the repo root documents the full list.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Walks up from `start` looking for the monorepo root marker. */
export function findRepoRoot(start: string): string | null {
  let dir = start;
  for (;;) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'apps'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Absolute path of the monorepo root, or `null` when run outside the repo. */
export const REPO_ROOT: string | null = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/** Absolute path of the repo-root env file, whether or not it exists yet. */
export const ENV_FILE: string | null = REPO_ROOT ? join(REPO_ROOT, '.env.local') : null;

let envLoaded = false;
let envFileUsed: string | null = null;

function loadRepoEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  if (!ENV_FILE) return;
  try {
    process.loadEnvFile(ENV_FILE);
    envFileUsed = ENV_FILE;
  } catch {
    // No .env.local at the repo root — every value falls back to its default.
    envFileUsed = null;
  }
}

/** The env file that was actually read, or `null` when there was none. */
export function loadedEnvFile(): string | null {
  loadRepoEnv();
  return envFileUsed;
}

loadRepoEnv();
