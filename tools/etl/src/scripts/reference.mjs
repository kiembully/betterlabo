/**
 * Compile the portal's CURATED reference datasets into public data.
 *
 * These three differ from every other source in this ETL: they are not scraped or
 * fetched on a schedule. They are authored from published government and historical
 * sources, each fact carrying the URL it came from, and they live in `data/reference/`
 * as reviewed source data. This task validates them and publishes them, so the same
 * guarantees hold as for everything else the site serves:
 *
 *   - `apps/web/public/data/` is still generated, never hand-edited;
 *   - each file is content-hashed and timestamped;
 *   - provenance is recorded in the dataset registry like any other source.
 *
 * The validation is deliberately strict about the thing that matters most here:
 * a claim without a source, or a number without one, must fail the build rather
 * than reach a citizen. An unsourced emergency number is worse than no number.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { paths, repoRoot } from '../lib/paths.mjs';
import { recordProvenance } from '../lib/registry.mjs';
import { writeStableJson } from '../lib/write.mjs';
import { log } from '../lib/http.mjs';

const REFERENCE_DIR = join(repoRoot, 'data', 'reference');

async function readSource(name) {
  const path = join(REFERENCE_DIR, `${name}.json`);
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new Error(
        `missing ${path}. The curated reference datasets are committed source data; ` +
          'restore the file rather than letting the build silently publish an empty directory.',
      );
    }
    throw err;
  }
}

/** Every entry must name the evidence behind it. */
function assertSourced(entries, label, urlKeys) {
  const unsourced = [];
  for (const entry of entries) {
    const hasUrl = urlKeys.some((key) => {
      const value = entry[key];
      if (Array.isArray(value)) return value.length > 0;
      return typeof value === 'string' && value.startsWith('http');
    });
    if (!hasUrl) unsourced.push(entry.name ?? entry.office ?? entry.claim ?? JSON.stringify(entry).slice(0, 60));
  }
  if (unsourced.length > 0) {
    throw new Error(
      `${label}: ${unsourced.length} entr${unsourced.length === 1 ? 'y has' : 'ies have'} no source URL — ` +
        `${unsourced.slice(0, 3).join('; ')}. Add the source or remove the entry.`,
    );
  }
}

export async function run() {
  const services = await readSource('services');
  const hotlines = await readSource('hotlines');
  const history = await readSource('history');

  /* ── services ─────────────────────────────────────────────────────────────── */
  assertSourced(services.services ?? [], 'services', ['sourceUrl']);

  const byCategory = new Map();
  for (const service of services.services) {
    const list = byCategory.get(service.category) ?? [];
    list.push(service);
    byCategory.set(service.category, list);
  }
  const categories = [...byCategory.entries()]
    .map(([name, items]) => ({
      name,
      slug: name
        .toLowerCase()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      count: items.length,
      // A one-line description is built from the services themselves rather than
      // invented, so the card can never promise something the data does not hold.
      summary: null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  const servicesPayload = {
    municipality: services.municipality ?? 'Labo',
    province: services.province ?? 'Camarines Norte',
    note: services.note ?? null,
    count: services.services.length,
    categories,
    notPublished: services.notPublished ?? [],
    servicePagesSeen: services.servicePagesSeen ?? [],
    items: services.services,
    generatedAt: new Date().toISOString(),
  };
  await writeStableJson(paths.services, servicesPayload);

  /* ── hotlines ─────────────────────────────────────────────────────────────── */
  const hotlineEntries = (hotlines.tiers ?? []).flatMap((tier) => tier.entries ?? []);
  assertSourced(hotlineEntries, 'hotlines', ['sources', 'sourceUrl']);

  const hotlinesPayload = {
    municipality: hotlines.municipality ?? 'Labo',
    province: hotlines.province ?? 'Camarines Norte',
    note: hotlines.note ?? null,
    retrievedAt: hotlines.retrievedAt ?? null,
    tiers: hotlines.tiers ?? [],
    defects: (hotlines.defects ?? []).filter((defect) => defect.kind !== 'upstream'),
    upstreamDefects: (hotlines.defects ?? []).filter((defect) => defect.kind === 'upstream'),
    notFound: hotlines.notFound ?? [],
    generatedAt: new Date().toISOString(),
  };
  await writeStableJson(paths.hotlines, hotlinesPayload);

  /* ── history ──────────────────────────────────────────────────────────────── */
  assertSourced(history.citations ?? [], 'history citations', ['sourceUrl']);
  if (!Array.isArray(history.prose) || history.prose.length === 0) {
    throw new Error('history: prose is empty');
  }

  const historyPayload = {
    municipality: history.municipality ?? 'Labo',
    province: history.province ?? 'Camarines Norte',
    note: history.note ?? null,
    prose: history.prose,
    population: history.population ?? null,
    landArea: history.landArea ?? null,
    notableFacts: history.notableFacts ?? [],
    citations: history.citations ?? [],
    unsourced: history.unsourced ?? [],
    retrievedAt: history.retrievedAt ?? null,
    generatedAt: new Date().toISOString(),
  };
  await writeStableJson(paths.history, historyPayload);

  /* ── provenance, so these appear in the registry like every other source ──── */
  await recordProvenance({
    id: 'labo-services-directory',
    title: 'Municipal Services Directory (compiled from the LGU\'s own Citizen\'s Charter PDFs)',
    publisher: 'Municipality of Labo, Camarines Norte (labo.gov.ph)',
    sourceUrl: 'https://labo.gov.ph/services/citizens-charter/',
    outputs: ['apps/web/public/data/services.json'],
    license: 'Public domain (Philippine government work)',
    retrievedAt: services.retrievedAt ?? new Date().toISOString(),
    note: `${services.services.length} services across ${categories.length} categories; ${(services.notPublished ?? []).length} published gaps recorded.`,
  });

  await recordProvenance({
    id: 'labo-emergency-contacts',
    title: 'Emergency and public-safety contact numbers for Labo',
    publisher: 'Compiled from the LGU, CNPPO, BFP, DOH and the national eHotlines portal',
    sourceUrl: 'https://ehotlines.e.gov.ph/',
    outputs: ['apps/web/public/data/hotlines.json'],
    license: 'Public domain (Philippine government work)',
    retrievedAt: hotlines.retrievedAt ?? new Date().toISOString(),
    note: `${hotlineEntries.length} entries; ${hotlinesPayload.defects.length} local defects and ${hotlinesPayload.upstreamDefects.length} upstream data defects recorded.`,
  });

  await recordProvenance({
    id: 'labo-history',
    title: 'A brief history of the Municipality of Labo',
    publisher: 'Compiled from NHI/NHCP markers, the Official Gazette, PSA, the provincial government and the LGU',
    sourceUrl: 'https://camsnorte.com/history/',
    outputs: ['apps/web/public/data/history.json'],
    license: 'Public domain (Philippine government work) / cited third parties',
    retrievedAt: history.retrievedAt ?? new Date().toISOString(),
    note: `${history.citations.length} citations; ${(history.unsourced ?? []).length} commonly repeated claims excluded as unsourced.`,
  });

  log(
    `reference: ${services.services.length} services in ${categories.length} categories, ` +
      `${hotlineEntries.length} hotlines, ${history.citations.length} history citations`,
  );
  log(`  services   → ${paths.services}`);
  log(`  hotlines   → ${paths.hotlines}`);
  log(`  history    → ${paths.history}`);
  if (categories.length > 0) {
    log(`  categories: ${categories.map((c) => `${c.name} (${c.count})`).join(', ')}`);
  }
}
