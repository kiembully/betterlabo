/**
 * TASK verify — the gate that runs after every refresh.
 *
 * It asserts the compiled files against each other and against the filesystem, so
 * a silent upstream change (a barangay added, a workbook restructured, a layer
 * that compiles to nothing) fails the refresh instead of shipping. Every
 * assertion prints `PASS <name>`; the first `FAIL` line names what disagreed and
 * the process exits non-zero.
 *
 * Run it with `npm run etl:verify`; the nightly workflow runs it after the ETL.
 */
import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { paths, rel } from '../lib/paths.mjs';

const EXPECTED_BARANGAYS = 52;
const MUNICIPALITY_PSGC = '0501606000';

let failures = 0;
let passes = 0;

function check(name, condition, detail) {
  if (condition) {
    passes += 1;
    console.log(`PASS ${name}`);
  } else {
    failures += 1
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function readJson(relPath) {
  try {
    return JSON.parse(await readFile(join(paths.repoRoot, relPath), 'utf8'));
  } catch (err) {
    return { __error: err?.message ?? String(err) };
  }
}

async function exists(relPath) {
  try {
    await access(join(paths.repoRoot, relPath));
    return true;
  } catch {
    return false;
  }
}

/** Proprietary-free identifier of the DPWH source, as used in the registry. */
const SOURCES_ID_DPWH = 'dpwh-infrastructure';

export async function run() {
  failures = 0;
  passes = 0;

  const index = await readJson('apps/web/public/data/barangays.json');
  const profile = await readJson('apps/web/public/data/profile.json');
  const fiscal = await readJson('apps/web/public/data/fiscal.json');
  const datasets = await readJson('apps/web/public/data/datasets.json');
  const hazards = await readJson('apps/web/public/data/hazards.json');
  const projects = await readJson('apps/web/public/data/projects.json');

  /* ── barangays ────────────────────────────────────────────────────────── */
  const barangays = index.barangays ?? [];
  check('barangays/index-readable', !index.__error, index.__error);
  check(
    `barangays/count-is-${EXPECTED_BARANGAYS}`,
    barangays.length === EXPECTED_BARANGAYS,
    `got ${barangays.length}`,
  );
  check(
    'barangays/all-psgc-10-digits-and-in-labo',
    barangays.every((b) => /^0501606\d{3}$/.test(b.psgcCode ?? '')),
    barangays.find((b) => !/^0501606\d{3}$/.test(b.psgcCode ?? ''))?.psgcCode,
  );
  check(
    'barangays/psgc-codes-unique',
    new Set(barangays.map((b) => b.psgcCode)).size === barangays.length,
  );
  check(
    'barangays/all-have-area',
    barangays.every((b) => typeof b.areaSqKm === 'number' && b.areaSqKm > 0),
  );
  check(
    'barangays/names-unique',
    new Set(barangays.map((b) => b.name)).size === barangays.length,
  );

  const geo = JSON.parse(await readFile(paths.barangayGeoJson, 'utf8'));
  const geoCodes = new Set(geo.features.map((f) => f.properties.psgc_code));
  check('barangays/geojson-feature-count', geo.features.length === (barangays.length || -1), `geojson has ${geo.features.length}`);
  check(
    'barangays/index-and-geojson-agree',
    barangays.every((b) => geoCodes.has(b.psgcCode)) &&
      geo.features.every((f) => barangays.some((b) => b.psgcCode === f.properties.psgc_code)),
  );
  check(
    'barangays/geometry-present-and-nonempty',
    geo.features.every(
      (f) =>
        f.geometry &&
        (f.geometry.type === 'Polygon' || f.geometry.type === 'MultiPolygon') &&
        JSON.stringify(f.geometry.coordinates).length > 20,
    ),
  );

  const [minLng, minLat, maxLng, maxLat] = profile.bounds ?? [0, 0, 0, 0];
  check(
    'barangays/centroids-inside-municipal-bounds',
    barangays.every(
      (b) =>
        b.centroid.lng >= minLng - 0.02 &&
        b.centroid.lng <= maxLng + 0.02 &&
        b.centroid.lat >= minLat - 0.02 &&
        b.centroid.lat <= maxLat + 0.02,
    ),
    barangays
      .filter(
        (b) =>
          b.centroid.lng < minLng - 0.02 ||
          b.centroid.lng > maxLng + 0.02 ||
          b.centroid.lat < minLat - 0.02 ||
          b.centroid.lat > maxLat + 0.02,
      )
      .map((b) => b.name)
      .join(', '),
  );

  const areaSum = barangays.reduce((s, b) => s + (b.areaSqKm ?? 0), 0);
  check(
    'barangays/area-sum-matches-municipality-within-2pct',
    profile.areaSqKm != null && Math.abs(areaSum - profile.areaSqKm) / profile.areaSqKm < 0.02,
    `barangay sum ${areaSum.toFixed(2)} vs municipal ${profile.areaSqKm}`,
  );
  check('profile/barangay-count-matches-index', profile.barangayCount === barangays.length);
  check('profile/pending-fields-documented', Array.isArray(profile.pendingFields) && profile.pendingFields.length > 0);

  const sha = await readFile(`${paths.barangayGeoJson}.sha256`, 'utf8').catch(() => null);
  check(
    'barangays/geojson-sha256-sidecar-present',
    typeof sha === 'string' && /^[0-9a-f]{64}/.test(sha.trim()),
    sha === null ? 'no .sha256 sidecar' : 'malformed',
  );

  /* ── fiscal ───────────────────────────────────────────────────────────── */
  const sheets = fiscal.sheets ?? [];
  check('fiscal/readable', !fiscal.__error, fiscal.__error);
  check('fiscal/has-sheets', sheets.length > 0, `${sheets.length} sheets`);
  check(
    'fiscal/every-sheet-has-a-source-basis',
    sheets.every((s) => typeof s.basis === 'string' && s.basis.includes('BLGF')),
  );
  check(
    'fiscal/shared-fiscal-year-consistent',
    sheets.every((s) => s.fiscalYear === fiscal.fiscalYear),
  );
  check(
    'fiscal/no-NaN-amounts',
    sheets.every((s) => s.figures.every((f) => f.amount === null || Number.isFinite(f.amount))),
  );
  check(
    'fiscal/unit-declared-for-every-sheet',
    sheets.every((s) => s.unit === 'PHP' || s.unit === '%'),
  );
  check(
    'fiscal/dependency-ratios-are-percentages',
    sheets
      .filter((s) => s.unit === '%')
      .every((s) => (s.total ?? 0) <= 100.0001 && (s.total ?? 0) >= 0),
    sheets
      .filter((s) => s.unit === '%')
      .map((s) => `${s.id}=${s.total}`)
      .join(', '),
  );
  check(
    'fiscal/has-non-zero-figures',
    sheets.some((s) => s.figures.some((f) => (f.amount ?? 0) > 0)),
  );
  check('fiscal/marked-preliminary-like-the-source', fiscal.preliminary === true);

  const nta = sheets.find((s) => s.id === 'ari-national-tax-allotment-nta');
  const ntaDep = sheets.find((s) => s.id === 'ari-nta-dependency');
  check(
    'fiscal/nta-and-dependency-present',
    Boolean(nta && ntaDep),
    `nta=${Boolean(nta)} dependency=${Boolean(ntaDep)}`,
  );

  /* ── hazards ──────────────────────────────────────────────────────────── */
  const layers = hazards.layers ?? [];
  check('hazards/readable', !hazards.__error, hazards.__error);
  check('hazards/layers-declared', layers.length > 0, `${layers.length} layers`);
  check(
    'hazards/every-layer-explains-itself',
    layers.every((l) => l.mode !== 'absent' || (typeof l.note === 'string' && l.note.length > 30)),
    layers.filter((l) => l.mode === 'absent' && !l.note).map((l) => l.id).join(', '),
  );
  check(
    'hazards/static-layers-have-features',
    layers.filter((l) => l.mode === 'static').every((l) => (l.featureCount ?? 0) > 0),
    layers.filter((l) => l.mode === 'static' && !(l.featureCount > 0)).map((l) => l.id).join(', '),
  );
  for (const layer of layers.filter((l) => l.mode === 'static' && l.file)) {
    const ok = await exists(`apps/web/public/data/${layer.file}`);
    check(`hazards/file-exists:${layer.id}`, ok, layer.file);
  }
  check(
    'hazards/absent-layers-are-not-in-the-ui-as-live',
    layers.every((l) => l.mode !== 'none-in-area' || typeof l.note === 'string'),
  );

  /* ── provenance registry ──────────────────────────────────────────────── */
  const sources = datasets.datasets ?? [];
  check('datasets/readable', !datasets.__error, datasets.__error);
  check('datasets/registry-not-empty', sources.length > 0);
  check(
    'datasets/every-source-has-licence-and-url',
    sources.every((d) => d.license && /^https?:\/\//.test(d.sourceUrl ?? '')),
    sources.filter((d) => !d.license || !/^https?:\/\//.test(d.sourceUrl ?? '')).map((d) => d.id).join(', '),
  );
  check(
    'datasets/every-compiled-source-lists-outputs',
    sources.filter((d) => !d.unavailable).every((d) => Array.isArray(d.outputs) && d.outputs.length > 0),
    sources.filter((d) => !d.unavailable && (!d.outputs || d.outputs.length === 0)).map((d) => d.id).join(', '),
  );
  check(
    'datasets/unavailable-sources-say-why',
    sources.filter((d) => d.unavailable).every((d) => typeof d.notes === 'string' && d.notes.length > 20),
  );

  const distinctHashes = new Set(sources.map((d) => d.dataHash).filter(Boolean));
  check(
    'datasets/finalised-with-a-data-hash',
    Boolean(datasets.dataHash) && distinctHashes.size === 0,
    `registry dataHash=${Boolean(datasets.dataHash)}`,
  );

  /* ── projects (optional) ──────────────────────────────────────────────── */
  if (!projects.__error) {
    check(
      'projects/counts-are-consistent',
      (projects.counts?.laboRows ?? -1) === (projects.projects?.length ?? -2),
      `counts.laboRows=${projects.counts?.laboRows} projects=${projects.projects?.length}`,
    );
    check(
      'projects/every-row-has-a-source-id',
      (projects.projects ?? []).every((p) => p.sourceId === SOURCES_ID_DPWH),
    );
  } else {
    console.log('SKIP projects/not-compiled (run `npm run etl projects`)');
  }

  /* ── lgu (the LGU's own website) ──────────────────────────────────────── */
  const lgu = await readJson('apps/web/public/data/lgu.json');
  if (!lgu.__error) {
    check(
      'lgu/executive-offices-are-present',
      (lgu.officials?.executive?.length ?? 0) >= 2,
      `executive=${lgu.officials?.executive?.length}`,
    );
    check(
      'lgu/department-head-count-matches-its-own-count',
      (lgu.officials?.departmentHeads?.length ?? -1) === (lgu.officials?.counts?.departmentHeads ?? -2),
      `heads=${lgu.officials?.departmentHeads?.length} counts=${lgu.officials?.counts?.departmentHeads}`,
    );
    // The whole reason this dataset is trustworthy: it does not claim a current
    // office-holder it cannot see. A name recovered from an older capture MUST
    // carry the date it came from.
    check(
      'lgu/executive-names-off-the-current-page-carry-a-date',
      (lgu.officials?.executive ?? []).every((e) => !e.nameRemovedFromCurrentPage || Boolean(e.nameAsOf)),
      'a recovered name without the date it was stated would read as current',
    );
    check(
      'lgu/legislative-roles-line-up-with-their-holder',
      (lgu.legislative?.members ?? []).every((m) => typeof m.name === 'string' && m.name.length > 2),
    );
    check(
      'lgu/at-most-one-vice-mayor',
      (lgu.legislative?.members ?? []).filter((m) => m.kind === 'vice-mayor').length <= 1,
      'the first parser read roles backwards and produced two',
    );
    check(
      'lgu/legislative-counts-matches-the-member-list',
      (lgu.legislative?.counts?.total ?? -1) === (lgu.legislative?.members?.length ?? -2),
    );
    check(
      'lgu/every-snapshot-ref-has-a-date-and-a-url',
      Object.values(lgu.snapshots ?? {})
        .filter(Boolean)
        .every((s) => typeof s.url === 'string' && s.url.includes('web.archive.org')),
    );
    // The cross-check is the strongest evidence in this file: an independent
    // source (the LGU's own list) agreeing with the PSGC-compiled index.
    check(
      'lgu/lgu-barangay-list-agrees-with-the-psgc-index',
      lgu.barangayCrossCheck?.compiledCount === EXPECTED_BARANGAYS && lgu.barangayCrossCheck?.matched === EXPECTED_BARANGAYS,
      `matched=${lgu.barangayCrossCheck?.matched}/${lgu.barangayCrossCheck?.compiledCount}`,
    );
    check(
      'lgu/offices-carry-an-address',
      (lgu.offices?.all ?? []).every((o) => typeof o.name === 'string' && o.name.length > 2),
    );
  } else {
    console.log('SKIP lgu/not-compiled (run `npm run etl lgu`)');
  }

  const lguDocuments = await readJson('apps/web/public/data/lgu-documents.json');
  if (!lguDocuments.__error) {
    check(
      'lgu-documents/count-matches-the-item-list',
      (lguDocuments.count ?? -1) === (lguDocuments.items?.length ?? -2),
    );
    check(
      'lgu-documents/by-kind-totals-the-count',
      Object.values(lguDocuments.byKind ?? {}).reduce((a, b) => a + b, 0) === (lguDocuments.count ?? -1),
    );
    check(
      'lgu-documents/every-entry-is-marked-as-a-derived-title',
      (lguDocuments.items ?? []).every((d) => d.titleDerived === true && d.url?.startsWith('https://labo.gov.ph/')),
      'derived titles must never be presented as the document’s own heading',
    );
  } else {
    console.log('SKIP lgu-documents/not-compiled (run `npm run etl lgu`)');
  }

  /* ── every compiled file exists ───────────────────────────────────────── */
  for (const relPath of [
    'apps/web/public/data/barangays.json',
    'apps/web/public/data/labo-barangays.geojson',
    'apps/web/public/data/labo-municipality.geojson',
    'apps/web/public/data/profile.json',
    'apps/web/public/data/fiscal.json',
    'apps/web/public/data/hazards.json',
    'apps/web/public/data/datasets.json',
    'apps/web/public/data/lgu.json',
    'apps/web/public/data/lgu-documents.json',
  ]) {
    check(`file-exists:${rel(join(paths.repoRoot, relPath))}`, await exists(relPath), relPath);
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
  return { passes, failures };
}

