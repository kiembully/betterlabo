/**
 * TASK projects — compile DPWH infrastructure projects located in Labo.
 *
 * Upstream: data.bettergov.ph dataset 19 (DPWH Infrastructure Transparency
 * Dataset), CC0. A 24 MB Parquet file with 248,220 rows on HuggingFace.
 *
 * HOW IT READS THE FILE: over HTTP range requests (`asyncBufferFromUrl`), with a
 * column projection. The ETL never downloads all 24 MB — hyparquet fetches only
 * the column chunks the projection names, which matters because this host
 * measured ~0.05 MB/s from HuggingFace.
 *
 * THE LOCATION CONSTRAINT, stated plainly: the Parquet schema carries
 * `location.province` and `location.region` and NOTHING finer — there is no
 * municipality or city column. A Labo project therefore cannot be selected by
 * field. This task narrows to Camarines Norte by province, then flags the rows
 * whose `description` contains a Labo place-name token, records both counts in
 * the provenance note, and writes only the flagged rows to the public file. The
 * counts are published so a reader can see how much was excluded.
 */
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import {
  asyncBufferFromFile,
  asyncBufferFromUrl,
  parquetMetadataAsync,
  parquetReadObjects,
  snappyUncompress,
} from 'hyparquet';

import { log } from '../lib/http.mjs';
import { paths } from '../lib/paths.mjs';
import { recordProvenance, recordUnavailable } from '../lib/registry.mjs';
import { SOURCES } from '../lib/sources.mjs';
import { writeStableJson } from '../lib/write.mjs';

const PROVINCE = 'Camarines Norte';
/** Place-name tokens that identify Labo in a DPWH project description. */
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
  if (typeof value === 'object' && 'valueOf' in value) {
    const n = Number(value.valueOf());
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parquet DATE arrives as days since the epoch (or as a Date). */
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

export async function run(ctx) {
  const src = SOURCES.dpwh;

  /**
   * Two ways in, and the local one wins when it exists:
   *  - a file already in `data/sources/` is read directly (this is also what makes
   *    a re-run and CI-with-cache fast, and lets the task work offline);
   *  - otherwise the Parquet is streamed over HTTP range requests with a column
   *    projection, so the ETL still never downloads all 24 MB in one piece.
   */
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

  let rows;
  let totalRows = null;
  try {
    let file;
    if (useLocal) {
      log(`projects: reading the cached Parquet (${(localBytes / 1e6).toFixed(1)} MB) from disk`);
      file = await asyncBufferFromFile(localPath);
    } else {
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

    rows = await parquetReadObjects({
      file,
      columns: COLUMNS,
      compressors: { SNAPPY: snappyUncompress },
      rowFormat: 'object',
    });
  } catch (err) {
    const message = err?.message ?? String(err);
    log(`projects: could not read the Parquet file — ${message}`);
    await recordUnavailable(src, `reading the Parquet file failed (${message})`);
    return;
  }

  const scanned = rows.length;
  const inProvince = [];
  for (const row of rows) {
    const province = text(row.location?.province) ?? '';
    if (province.toLowerCase() !== PROVINCE.toLowerCase()) continue;
    inProvince.push(row);
  }

  const labo = inProvince.filter((row) => LABO_TOKEN.test(text(row.description) ?? ''));

  const projects = labo.map((row, i) => ({
    id: text(row.contractId) ?? `dpwh-${i}`,
    description: text(row.description) ?? '(no description in source)',
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
    latitude: toNumber(row.latitude),
    longitude: toNumber(row.longitude),
    province: text(row.location?.province),
    region: text(row.location?.region),
    sourceId: src.id,
  }));

  projects.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));

  const withAmount = projects.filter((p) => p.amount != null);
  const totalAmount = withAmount.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  await writeStableJson(paths.projects, {
    municipality: 'Labo',
    province: PROVINCE,
    note: labo.length
      ? `Selected by province (${PROVINCE}) then by a Labo place-name token in the project description, because the source Parquet has no municipality column. ${projects.length} of ${inProvince.length} ${PROVINCE} projects matched.`
      : `No project description in the ${PROVINCE} rows contains a Labo place-name token. The source Parquet has no municipality column, so a Labo project cannot be selected by field; a Labo project listed without the town in its description is invisible to this filter.`,
    counts: {
      rowsScanned: scanned,
      provinceRows: inProvince.length,
      laboRows: projects.length,
    },
    totals: {
      amountSum: withAmount.length > 0 ? totalAmount : null,
      withAmount: withAmount.length,
      withoutAmount: projects.length - withAmount.length,
    },
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
    bytes: null,
    sha256: null,
    outputs: ['apps/web/public/data/projects.json'],
    notes: `Read over HTTP range requests with a column projection from a ${totalRows ?? scanned}-row Parquet file. ${inProvince.length} rows are in ${PROVINCE}; ${projects.length} mention Labo in the description. The dataset has no municipality column, so the place-name match is the only available selector and may miss projects whose description omits the town name.`,
    unavailable: false,
  });

  log(
    `projects: ${projects.length} Labo project(s) from ${inProvince.length} ${PROVINCE} row(s) out of ${scanned} scanned`,
  );
}
