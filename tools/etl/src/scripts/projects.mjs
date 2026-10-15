/**
 * TASK projects — compile DPWH infrastructure projects located in Labo.
 *
 * Upstream: data.bettergov.ph dataset 19 (DPWH Infrastructure Transparency
 * Dataset), CC0. A 24 MB Parquet file, 248,220 rows.
 *
 * HOW THE ROWS ARE SELECTED — this needed three findings, and each one changed
 * the answer:
 *
 *  1. `location.province` is NOT a project location. It holds the implementing
 *     **District Engineering Office** — values read "Agusan del Norte DEO",
 *     "Camarines Norte DEO", "Region V". Filtering it for a municipality matches
 *     nothing, and filtering it for a province only says which office built the
 *     thing.
 *  2. The dataset DOES carry `latitude`/`longitude`. 214,747 of the 248,220 rows
 *     have usable coordinates, so projects can be located properly.
 *  3. A bounding-box test over Labo's rectangle over-includes neighbours: the
 *     bbox's western edge reaches into Tagkawayan, Quezon (28 rows implement by
 *     "Quezon 4th DEO"). So the selector is a point-in-polygon test against the
 *     compiled BARANGAY polygons — the same authoritative geometry the hazard
 *     clip uses — and the containing barangay is recorded with the project.
 *
 * Rows that mention Labo in the description but carry no usable coordinate are
 * counted and reported rather than included: their location cannot be verified.
 *
 * HOW IT READS THE FILE: it downloads once to the ETL cache with the shared
 * resumable downloader, then reads from disk. Streaming over HTTP range requests
 * is kept as the fallback. Note `compressors` must NOT be passed to
 * `parquetReadObjects` here — hyparquet handles the file's compression itself and
 * an explicit `compressors` map fails with `Cannot create property '0' on number`
 * on this file.
 */
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  asyncBufferFromFile,
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
} from 'hyparquet';

import { bboxOf, bboxesOverlap, pointInGeometry } from '../lib/geo.mjs';
import { downloadToFile, log, sha256File } from '../lib/http.mjs';
import { paths } from '../lib/paths.mjs';
import { recordProvenance, recordUnavailable } from '../lib/registry.mjs';
import { SOURCES } from '../lib/sources.mjs';
import { writeStableJson } from '../lib/write.mjs';

const LABO_TOKEN = /\blabo\b/i;

const COLUMNS = [
  'contractId',
  'description',
  'category',
  'componentCategories',
  'status',
  'budget',
  'amountPaid',
  'progress',
  'contractor',
  'startDate',
  'completionDate',
  'infraYear',
  'programName',
  'sourceOfFunds',
  'latitude',
  'longitude',
  'location',
];

function toNumber(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parquet DATE arrives as a Date, or as days since the epoch. */
function toIsoDate(value) {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const days = toNumber(value);
  if (days == null) return null;
  return new Date(Date.UTC(1970, 0, 1) + days * 86_400_000).toISOString().slice(0, 10);
}

function text(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

/** The compiled barangay polygons — the authoritative boundary for this test. */
async function laboBarangays() {
  const fc = JSON.parse(await readFile(paths.barangayGeoJson, 'utf8'));
  return fc.features
    .map((f) => ({
      psgcCode: f.properties.psgc_code,
      name: f.properties.name,
      geometry: f.geometry,
      bbox: bboxOf(f),
    }))
    .filter((b) => b.psgcCode && b.geometry);
}

export async function run(ctx) {
  const src = SOURCES.dpwh;
  const localPath = join(paths.cacheDir, 'dpwh_transparency_data.parquet');
  const localBytes = existsSync(localPath) ? (await stat(localPath)).size : 0;
  const useLocal = localBytes > 0;

  if (ctx.offline && !useLocal) {
    await recordUnavailable(src, 'the projects task needs the Parquet locally or network access');
    log('projects: skipped (offline, and no cached Parquet)');
    return;
  }
  if (!useLocal && ctx.cachedOnly) {
    await recordUnavailable(
      src,
      `running with --cached-only and no Parquet is present at ${localPath}`,
    );
    log('projects: skipped (cached-only, and no cached Parquet)');
    return;
  }

  const barangays = await laboBarangays();
  if (barangays.length === 0) {
    await recordUnavailable(src, 'no compiled barangay geometry to test coordinates against');
    log('projects: skipped (run `npm run etl barangays` first)');
    return;
  }
  const laboBbox = barangays.reduce(
    (acc, b) => [
      Math.min(acc[0], b.bbox[0]),
      Math.min(acc[1], b.bbox[1]),
      Math.max(acc[2], b.bbox[2]),
      Math.max(acc[3], b.bbox[3]),
    ],
    [180, 90, -180, -90],
  );

  let rows;
  let totalRows = null;
  try {
    if (!useLocal) {
      try {
        log(`projects: downloading ${src.sourceUrl}`);
        await downloadToFile(src.sourceUrl, localPath, {
          timeout: Number(process.env.ETL_HTTP_TIMEOUT_MS ?? 3_600_000),
          logEveryBytes: 8 * 1024 * 1024,
          extraHeaders: { 'User-Agent': 'BetterLabo-ETL/0.1 (+https://betterlabo.org)' },
        });
      } catch (err) {
        log(
          `projects: download failed (${err instanceof Error ? err.message : err}); falling back to HTTP range reads`,
        );
      }
    }

    const cachedBytes = existsSync(localPath) ? (await stat(localPath)).size : 0;
    let file;
    if (cachedBytes > 0) {
      log(`projects: reading ${(cachedBytes / 1e6).toFixed(1)} MB from ${localPath}`);
      file = await asyncBufferFromFile(localPath);
    } else {
      log('projects: no cached file — reading over HTTP range requests');
      file = await asyncBufferFromUrl({
        url: src.sourceUrl,
        requestInit: { headers: { 'User-Agent': 'BetterLabo-ETL/0.1 (+https://betterlabo.org)' } },
      });
    }

    const meta = await parquetMetadataAsync(file);
    totalRows = Number(meta.num_rows ?? 0);
    log(
      `projects: ${totalRows} rows in ${meta.row_groups.length} row group(s); projecting ${COLUMNS.length} columns`,
    );

    rows = await parquetReadObjects({ file, columns: COLUMNS });
  } catch (err) {
    const message = err?.message ?? String(err);
    log(`projects: could not read the Parquet file — ${message}`);
    await recordUnavailable(src, `reading the Parquet file failed (${message})`);
    return;
  }

  const scanned = rows.length;
  let withCoordinates = 0;
  let insideBbox = 0;
  let mentionsLaboButUnlocated = 0;
  const projects = [];
  const byBarangay = new Map();

  for (const row of rows) {
    const lat = toNumber(row.latitude);
    const lng = toNumber(row.longitude);
    const description = text(row.description) ?? '(no description in source)';
    const mentionsLabo = LABO_TOKEN.test(description);

    const usable = lat != null && lng != null && lat !== 0 && lng !== 0;
    if (usable) withCoordinates += 1;

    const point = usable ? [lng, lat] : null;
    const inBbox = point != null && bboxesOverlap([lng, lat, lng, lat], laboBbox);
    if (inBbox) insideBbox += 1;

    // The authoritative test: is this coordinate inside one of the 52 barangays?
    const barangay = inBbox
      ? barangays.find(
          (b) => bboxesOverlap([lng, lat, lng, lat], b.bbox) && pointInGeometry(point, b.geometry),
        )
      : null;

    if (!barangay) {
      if (mentionsLabo) mentionsLaboButUnlocated += 1;
      continue;
    }

    byBarangay.set(barangay.psgcCode, {
      psgcCode: barangay.psgcCode,
      name: barangay.name,
      count: (byBarangay.get(barangay.psgcCode)?.count ?? 0) + 1,
    });

    projects.push({
      id: text(row.contractId) ?? `dpwh-${projects.length}`,
      description,
      category: text(row.category) ?? text(row.componentCategories),
      status: text(row.status),
      contractor: text(row.contractor),
      amount: toNumber(row.budget),
      amountPaid: toNumber(row.amountPaid),
      progressPercent: toNumber(row.progress),
      sourceOfFunds: text(row.sourceOfFunds),
      program: text(row.programName),
      year: Number.isFinite(Number(row.infraYear)) ? Number(row.infraYear) : null,
      startedOn: toIsoDate(row.startDate),
      completedOn: toIsoDate(row.completionDate),
      latitude: lat,
      longitude: lng,
      barangay: barangay.name,
      barangayPsgc: barangay.psgcCode,
      /** The implementing District Engineering Office, which is what `location` actually holds. */
      implementingOffice: text(row.location?.province),
      region: text(row.location?.region),
      mentionsLabo,
      sourceId: src.id,
    });
  }

  projects.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  const withAmount = projects.filter((p) => p.amount != null);
  const totalAmount = withAmount.reduce((sum, p) => sum + (p.amount ?? 0), 0);
  const years = projects.map((p) => p.year).filter((y) => y != null);

  await writeStableJson(paths.projects, {
    municipality: 'Labo',
    province: 'Camarines Norte',
    method:
      'A project is included when its latitude/longitude falls inside one of the 52 compiled barangay polygons (point-in-polygon, not a bounding box). The containing barangay is recorded with it. The source has no municipality column, and its `location` field holds the implementing District Engineering Office rather than a project location.',
    note:
      projects.length > 0
        ? `${projects.length} DPWH projects are located inside Labo. ${withAmount.length} carry a contract amount; ${projects.length - withAmount.length} do not.`
        : 'No DPWH project coordinate falls inside a Labo barangay polygon.',
    counts: {
      rowsScanned: scanned,
      rowsWithCoordinates: withCoordinates,
      rowsInsideBoundingBox: insideBbox,
      laboRows: projects.length,
      /**
       * Rows whose description names Labo but which carry no usable coordinate.
       * Excluded from `projects` because their location cannot be verified.
       */
      mentionsLaboButUnlocated,
      barangaysWithProjects: byBarangay.size,
    },
    totals: {
      amountSum: withAmount.length > 0 ? totalAmount : null,
      withAmount: withAmount.length,
      withoutAmount: projects.length - withAmount.length,
      earliestYear: years.length > 0 ? Math.min(...years) : null,
      latestYear: years.length > 0 ? Math.max(...years) : null,
    },
    byBarangay: [...byBarangay.values()].sort((a, b) => b.count - a.count),
    projects,
    sources: [src.id],
  });

  await recordProvenance({
    id: src.id,
    title: src.title,
    publisher: src.publisher,
    portalDatasetId: src.portalDatasetId,
    portalUrl: src.portalUrl,
    sourceUrl: src.sourceUrl,
    license: src.license,
    licenseUrl: src.licenseUrl,
    attributionText: src.attributionText,
    retrievedAt: new Date().toISOString(),
    sourceVersion: src.sourceVersion,
    rowCount: projects.length,
    bytes: existsSync(localPath) ? (await stat(localPath)).size : null,
    sha256: existsSync(localPath) ? await sha256File(localPath) : null,
    outputs: ['apps/web/public/data/projects.json'],
    notes: `Read from a ${totalRows ?? scanned}-row Parquet file (17 of 25 columns projected). ${withCoordinates} rows carry usable coordinates; ${insideBbox} fall inside Labo's bounding box, and ${projects.length} fall inside a Labo barangay polygon. ${mentionsLaboButUnlocated} row(s) name Labo in the description but could not be located, so they are excluded. \`location.province\` is the implementing District Engineering Office, not a project location.`,
    unavailable: false,
  });

  log(
    `projects: ${projects.length} inside a Labo barangay (of ${insideBbox} in the bbox, ${withCoordinates} with coordinates); ${mentionsLaboButUnlocated} Labo mentions unlocated`,
  );
}
