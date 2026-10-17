/**
 * Compiles the cached static data the public portal reads.
 *
 *   node tools/etl/src/cli.mjs <task…> [flags]
 *
 * Tasks: barangays, profile, fiscal, projects, lgu, hazards, registry, verify, all
 * Flags: --force (ignore cached downloads), --offline (never touch the network),
 *        --only=<file substring> for verify
 */
import { access, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { log } from './lib/http.mjs';
import { paths, rel } from './lib/paths.mjs';
import { readRegistry, recordUnavailable, resetRegistry } from './lib/registry.mjs';
import { PENDING_FIELDS, SOURCES } from './lib/sources.mjs';
import { writeStableJson } from './lib/write.mjs';

const TASKS = ['barangays', 'profile', 'fiscal', 'projects', 'lgu', 'updates', 'reference', 'hazards', 'registry', 'verify'];

function parseArgs(argv) {
  const tasks = [];
  const flags = { force: false, offline: false, only: null, cachedOnly: false };
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [k, v] = arg.slice(2).split('=');
      if (k === 'force') flags.force = true;
      else if (k === 'offline') flags.offline = true;
      else if (k === 'cached-only') flags.cachedOnly = true;
      else if (k === 'only') flags.only = v ?? null;
      else throw new Error(`Unknown flag --${k}`);
    } else if (arg === 'all') {
      tasks.push(...TASKS.filter((t) => t !== 'verify'));
    } else if (TASKS.includes(arg)) {
      tasks.push(arg);
    } else {
      throw new Error(`Unknown task "${arg}". Known: ${TASKS.join(', ')}, all`);
    }
  }
  if (tasks.length === 0) tasks.push('all');
  // `profile` depends on the barangay index, and `registry` summarises them all.
  const order = ['barangays', 'profile', 'fiscal', 'projects', 'lgu', 'updates', 'reference', 'hazards', 'registry', 'verify'];
  const unique = [...new Set(tasks)].sort((a, b) => order.indexOf(a) - order.indexOf(b));
  if (!unique.includes('registry') && unique.some((t) => t !== 'verify')) unique.push('registry');
  return { tasks: unique, flags };
}

const ctx = { force: false, offline: false, cachedOnly: false };

async function taskBarangays() {
  const { run } = await import('./scripts/barangays.mjs');
  return run(ctx);
}
async function taskProfile() {
  const { run } = await import('./scripts/profile.mjs');
  return run(ctx);
}
async function taskFiscal() {
  const { run } = await import('./scripts/fiscal.mjs');
  return run(ctx);
}
async function taskProjects() {
  const { run } = await import('./scripts/projects.mjs');
  return run(ctx);
}
async function taskLgu() {
  const { run } = await import('./scripts/lgu.mjs');
  return run(ctx);
}
async function taskUpdates() {
  const { run } = await import('./scripts/updates.mjs');
  return run(ctx);
}

async function taskReference() {
  const { run } = await import('./scripts/reference.mjs');
  return run(ctx);
}

async function taskHazards() {
  const { run } = await import('./scripts/hazards.mjs');
  return run(ctx);
}

async function taskRegistry() {
  const datasets = await readRegistry();
  const missing = Object.values(SOURCES).filter((s) => !datasets.some((d) => d.id === s.id));
  for (const s of missing) {
    await recordUnavailable(s, 'no task in this run produced it');
  }
  const all = await readRegistry();
  await writeStableJson(paths.datasets, {
    municipality: 'Labo, Camarines Norte',
    datasets: all,
    pendingFields: PENDING_FIELDS,
  });
  log(`registry: ${all.length} sources (${all.filter((d) => d.unavailable).length} unavailable)`);
}

async function taskVerify() {
  const { run } = await import('./scripts/verify.mjs');
  return run(ctx);
}

const RUNNERS = {
  barangays: taskBarangays,
  profile: taskProfile,
  fiscal: taskFiscal,
  projects: taskProjects,
  lgu: taskLgu,
  updates: taskUpdates,
  reference: taskReference,
  hazards: taskHazards,
  registry: taskRegistry,
  verify: taskVerify,
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { tasks, flags } = parseArgs(process.argv.slice(2));
  ctx.force = flags.force;
  ctx.offline = flags.offline;
  ctx.cachedOnly = flags.cachedOnly;

  if (tasks.includes('barangays') && flags.force) {
    // A forced barangay run rebuilds the registry from scratch.
    await resetRegistry();
  }

  log(`repo   ${paths.repoRoot}`);
  log(`output ${rel(paths.publicDataDir)}`);
  log(`cache  ${rel(paths.cacheDir)}`);
  log(`tasks  ${tasks.join(', ')}`);
  log(`node   ${process.version}`);

  const started = Date.now();
  const failures = [];
  for (const task of tasks) {
    const t0 = Date.now();
    try {
      await RUNNERS[task]();
      log(`✓ ${task} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    } catch (err) {
      failures.push({ task, message: err?.message ?? String(err) });
      log(`✗ ${task}: ${err?.message ?? err}`);
    }
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (failures.length > 0) {
    log(`${failures.length} task(s) failed in ${seconds}s`);
    for (const f of failures) log(`   - ${f.task}: ${f.message}`);
    process.exitCode = 1;
    return;
  }
  log(`done in ${seconds}s`);
  if (!(await exists(paths.datasets))) {
    log('note: datasets.json missing — run `npm run etl registry`');
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
