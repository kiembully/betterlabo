/**
 * TASK barangays — compile Labo's 52 barangay polygons from the PSA/NAMRIA
 * hierarchical boundary release into cached static JSON.
 *
 * Upstream: data.bettergov.ph dataset 23, release v2026.4.13.0 (MIT).
 *   barangays.geojson       66.9 MB, 42,026 features nationally
 *   municipalities.geojson   6.0 MB,  1,485 features
 * Selection: ADM3_PCODE === "PH0501606" (Labo, Camarines Norte). Verified to
 * return exactly 52 features, matching the municipality record's own
 * `psgc_name`/`AREA_SQKM`.
 *
 * Outputs:
 *   apps/web/public/data/labo-barangays.geojson   (minified, simplified)
 *   apps/web/public/data/labo-municipality.geojson
 *   apps/web/public/data/barangays.json           (directory index)
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { downloadToFile, fetchBuffer, log, sha256Buffer } from '../lib/http.mjs';
import { paths } from '../lib/paths.mjs';
import { SOURCES } from '../lib/sources.mjs';
import {
  areaKm2,
  bboxOf,
  centroidLatLng,
  simplifyFeature,
  toFeatureCollection,
} from '../lib/geo.mjs';
import { writeGeoJson, writeStableJson } from '../lib/write.mjs';
import { recordProvenance } from '../lib/registry.mjs';

const LABO_PSGC_ID = 'PH0501606';
const LABO_PSGC_CODE = '0501606000';
/** ~22 m of detail — invisible at the zooms this map is used at. */
const SIMPLIFY_TOLERANCE = 0.0002;
const MUNICIPALITY_TOLERANCE = 0.0004;

function isPoblacion(name) {
  return /\(Pob\.?\)$/i.test(name.trim());
}

async function localPopulation() {
  const csvPath = join(paths.repoRoot, 'data', 'sources', 'psa-population.csv');
  let raw;
  try {
    raw = await readFile(csvPath, 'utf8');
  } catch {
    return new Map();
  }
  const map = new Map();
  const [header, ...rows] = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
  const cols = header.split(',').map((c) => c.trim().toLowerCase());
  const iCode = cols.indexOf('psgc_code');
  const iPop = cols.indexOf('population');
  const iSrc = cols.indexOf('source');
  const iYear = cols.indexOf('year');
  if (iCode < 0 || iPop < 0) {
    log('population CSV present but missing psgc_code/population headers — ignoring');
    return map;
  }
  for (const line of rows) {
    const parts = line.split(',');
    const code = parts[iCode]?.replace(/\D/g, '').padStart(10, '0');
    const pop = Number(parts[iPop]);
    if (!code || !Number.isFinite(pop)) continue;
    map.set(code, {
      population: Math.round(pop),
      populationSource: iSrc >= 0 ? (parts[iSrc]?.trim() ?? null) : null,
      populationYear: iYear >= 0 && Number.isFinite(Number(parts[iYear])) ? Number(parts[iYear]) : null,
    });
  }
  log(`population CSV: ${map.size} rows applied`);
  return map;
}

export async function run(ctx) {
  const src = SOURCES.boundaries;
  const destDir = paths.cacheDir;

  const barangaysPath = join(destDir, 'ph-barangays.geojson');
  const municipalitiesPath = join(destDir, 'ph-municipalities.geojson');

  let barangaysBytes = 0;
  let municipalitiesBytes = 0;

  if (ctx.offline) {
    log('offline mode — reading cached sources only');
    const b = await readFile(barangaysPath);
    barangaysBytes = b.length;
    const m = await readFile(municipalitiesPath);
    municipalitiesBytes = m.length;
  } else {
    const b = await downloadToFile(src.assets.barangays, barangaysPath, { force: ctx.force });
    barangaysBytes = b.bytes;
    const m = await downloadToFile(src.assets.municipalities, municipalitiesPath, {
      force: ctx.force,
    });
    municipalitiesBytes = m.bytes;
    log(`barangays.geojson ${(barangaysBytes / 1e6).toFixed(1)} MB, municipalities ${(municipalitiesBytes / 1e6).toFixed(1)} MB`);
  }

  const barangaysRaw = JSON.parse((await readFile(barangaysPath)).toString('utf8'));
  const municipalitiesRaw = JSON.parse((await readFile(municipalitiesPath)).toString('utf8'));

  const province = municipalitiesRaw.features.find(
    (f) => f.properties?.ADM3_PCODE === LABO_PSGC_ID,
  );
  if (!province) throw new Error(`No municipality feature for ${LABO_PSGC_ID}`);

  const laboFeatures = barangaysRaw.features.filter(
    (f) =>
      f.properties?.ADM3_PCODE === LABO_PSGC_ID ||
      String(f.properties?.psgc_code ?? '').startsWith('0501606'),
  );
  if (laboFeatures.length === 0) throw new Error('No Labo barangay features found');
  log(`selected ${laboFeatures.length} barangay features for Labo`);

  const population = await localPopulation();

  const indexEntries = [];
  const outFeatures = [];

  for (const feature of laboFeatures) {
    const p = feature.properties ?? {};
    const name = String(p.ADM4_EN ?? p.psgc_name ?? '').trim();
    const psgcCode = String(p.psgc_code ?? '').padStart(10, '0');
    const simplified = simplifyFeature(feature, SIMPLIFY_TOLERANCE);
    const pop = population.get(psgcCode) ?? null;

    outFeatures.push({
      type: 'Feature',
      properties: {
        psgc_code: psgcCode,
        name,
        area_sqkm: Number(p.AREA_SQKM ?? areaKm2(feature) ?? 0),
        is_poblacion: isPoblacion(name),
        municipality: 'Labo',
        province: 'Camarines Norte',
        hazard: null,
      },
      geometry: simplified.geometry,
    });

    indexEntries.push({
      psgcCode,
      psgcId: String(p.psgc_id ?? `PH${psgcCode}`),
      name,
      isPoblacion: isPoblacion(name),
      areaSqKm: Number(p.AREA_SQKM ?? areaKm2(feature) ?? 0),
      centroid: centroidLatLng(feature),
      bbox: bboxOf(feature).map((n) => Number(n.toFixed(6))),
      population: pop?.population ?? null,
      populationSource: pop?.populationSource ?? null,
      populationYear: pop?.populationYear ?? null,
      hasGeometry: Boolean(simplified.geometry),
    });
  }

  indexEntries.sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const municipalityFeature = {
    type: 'Feature',
    properties: {
      psgc_code: String(province.properties.psgc_code ?? LABO_PSGC_CODE),
      name: 'Labo',
      province: 'Camarines Norte',
      region: String(province.properties.ADM1_EN ?? 'Region V (Bicol Region)'),
      area_sqkm: Number(province.properties.AREA_SQKM ?? areaKm2(province)),
    },
    geometry: simplifyFeature(province, MUNICIPALITY_TOLERANCE).geometry,
  };

  const geo = await writeGeoJson(
    paths.barangayGeoJson,
    toFeatureCollection(outFeatures),
  );
  const mun = await writeGeoJson(
    paths.municipalityGeoJson,
    toFeatureCollection([municipalityFeature]),
  );

  const index = await writeStableJson(paths.barangayIndex, {
    municipality: 'Labo',
    municipalityPsgcCode: LABO_PSGC_CODE,
    count: indexEntries.length,
    barangays: indexEntries,
    totalAreaSqKm: Number(
      indexEntries.reduce((sum, b) => sum + b.areaSqKm, 0).toFixed(6),
    ),
    populationCoverage: indexEntries.filter((b) => b.population != null).length,
    note:
      indexEntries.some((b) => b.population != null)
        ? 'Population figures come from a local PSA census extract placed in data/sources/psa-population.csv.'
        : 'No barangay population source is wired: PSA publishes barangay-level census data as publications, not as a dataset on data.bettergov.ph. Place data/sources/psa-population.csv (psgc_code,population,source,year) and re-run to attach it.',
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
    rowCount: outFeatures.length,
    bytes: barangaysBytes + municipalitiesBytes,
    sha256: await sha256Buffer(await readFile(barangaysPath)),
    outputs: [
      'apps/web/public/data/labo-barangays.geojson',
      'apps/web/public/data/labo-municipality.geojson',
      'apps/web/public/data/barangays.json',
    ],
    notes: `Selected ${outFeatures.length} of ${barangaysRaw.features.length} national barangay polygons by ADM3_PCODE=${LABO_PSGC_ID}; geometry simplified at ${SIMPLIFY_TOLERANCE}°. Areas are the upstream AREA_SQKM values (NAMRIA-derived), not recomputed.`,
    unavailable: false,
  });

  log(
    `barangays: ${indexEntries.length} features, geojson ${(geo.bytes / 1024).toFixed(0)} KB, municipality ${(mun.bytes / 1024).toFixed(0)} KB`,
  );
  return { index, geo };
}

export { fetchBuffer };
