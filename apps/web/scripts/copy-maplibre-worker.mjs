/**
 * Copy MapLibre GL's worker into `public/` so it is served as a real module.
 *
 * Why this exists. MapLibre GL 6 constructs its worker internally with
 * `new Worker(url, { type: 'module' })`, where `url` is derived from
 * `import.meta.url` inside the library bundle. Turbopack does not rewrite that the
 * way webpack does, so in a production build the URL resolves relative to the
 * DOCUMENT — and the request for the worker comes back as the page's own HTML:
 *
 *   Failed to load module script: The server responded with a non-JavaScript
 *   MIME type of "text/html".  →  /map
 *   Error: Worker failed to load. Check that the worker URL is correct.
 *
 * The result is a map that boots, mounts its canvas and controls, and then renders
 * nothing at all. Serving the file ourselves and pointing MapLibre at it with
 * `setWorkerUrl()` removes the bundler from the equation entirely, and keeps the
 * worker version-locked to the installed package instead of vendored into the repo.
 *
 * Runs from `prebuild`/`predev`; `public/maplibre-gl-worker.mjs` is generated and
 * git-ignored.
 */
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const repoRoot = join(webRoot, '..', '..');

const source = join(repoRoot, 'node_modules', 'maplibre-gl', 'dist', 'maplibre-gl-worker.mjs');
const destination = join(webRoot, 'public', 'maplibre-gl-worker.mjs');

async function main() {
  let sourceStat;
  try {
    sourceStat = await stat(source);
  } catch {
    throw new Error(
      `MapLibre's worker was not found at ${source}.\n` +
        'Run `npm install` at the repo root first — the map needs this file at runtime.',
    );
  }
  if (sourceStat.size < 1000) {
    throw new Error(`Refusing to copy a suspiciously small worker (${sourceStat.size} bytes) from ${source}`);
  }

  await mkdir(dirname(destination), { recursive: true });

  const [incoming, existing] = await Promise.all([
    readFile(source),
    readFile(destination).catch(() => null),
  ]);
  if (existing && existing.equals(incoming)) {
    console.log(`maplibre worker: unchanged (${(incoming.length / 1024).toFixed(0)} KB)`);
    return;
  }

  await copyFile(source, destination);
  const hash = createHash('sha256').update(incoming).digest('hex');
  await writeFile(`${destination}.sha256`, `${hash}\n`, 'utf8');
  console.log(
    `maplibre worker: wrote public/maplibre-gl-worker.mjs (${(incoming.length / 1024).toFixed(0)} KB, sha256 ${hash.slice(0, 12)}…)`,
  );
}

await main();
