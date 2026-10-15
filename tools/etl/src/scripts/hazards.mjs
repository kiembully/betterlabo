/**
 * TASK hazards — clip Project NOAH hazard layers to Labo and compile them into
 * cached static GeoJSON.
 *
 * Upstream: data.bettergov.ph dataset 22 (Project NOAH, DOST), ODbL.
 * Each province archive is a zipped SHAPEFILE set (`.shp/.dbf/.prj/.shx`) in
 * WGS84 — not GeoJSON — so the pipeline is:
 *
 *   download province zip  →  shapefile → GeoJSON  →  bbox prefilter  →  exact
 *   polygon intersection with the Labo outline  →  simplify  →  minified GeoJSON
 *
 * Two honesty guards, because a hazard map that overstates or silently drops
 * coverage is worse than no hazard map:
 *  - if the exact intersection throws on a self-intersecting upstream polygon
 *    (NOAH's clipped contours do this), the bbox-clipped piece is kept and the
 *    number of such fallbacks is recorded in the layer's note;
 *  - if a province archive cannot be fetched in this run — HuggingFace egress
 *    measured ~0.05 MB/s from some networks, making the 138 MB landslide archive
 *    a 45-minute transfer — the layer is published as `absent` with the exact URL,
 *    and the map renders "not compiled" rather than an empty overlay.
 */
import { existsSync } from 'node:fs';
import { readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

import AdmZip from 'adm-zip';

import {
  bboxOf,
  bboxesOverlap,
  clipToPolygon,
  filterPolygonsInside,
  hazardLabel,
  pointInGeometry,
  roundCoordinates,
  simplifyFeature,
  toFeatureCollection,
} from '../lib/geo.mjs';
import { downloadToFile, log, sha256File } from '../lib/http.mjs';
import { paths } from '../lib/paths.mjs';
import { recordProvenance, recordUnavailable } from '../lib/registry.mjs';
import { SOURCES } from '../lib/sources.mjs';
import { writeGeoJson, writeStableJson } from '../lib/write.mjs';

/**
 * shpjs 6 is browser-first: it dereferences `self.DecompressionStream` at module
 * scope, so importing it in Node throws `ReferenceError: self is not defined`.
 * Defining `self` on globalThis first (Node already provides
 * DecompressionStream) makes it load, and the import must therefore be dynamic —
 * a static import would run before this shim.
 */
async function loadShp() {
  if (typeof globalThis.self === 'undefined') {
    globalThis.self = globalThis;
  }
  const mod = await import('shpjs');
  return mod.default ?? mod;
}

/** ~22 m of detail at the base tolerance; raised automatically if a layer is too big. */
const SIMPLIFY_TOLERANCE = 0.0003;
/**
 * Coordinates are rounded to 4 decimals (~11 m) AFTER simplification. Five
 * decimals costs ~35% more bytes for a precision the source shapefile does not
 * have, and the flood layer alone is otherwise 12.5 MB of GeoJSON.
 */
const COORD_PRECISION = 4;
/** Above this, the simplify tolerance is doubled until the layer fits. */
const MAX_LAYER_BYTES = 8 * 1024 * 1024;

const LAYER_LABELS = {
  flood_5yr: 'Flood — 5-year return period',
  flood_25yr: 'Flood — 25-year return period',
  flood_100yr: 'Flood — 100-year return period',
  landslide: 'Rain-induced landslide',
  storm_surge: 'Storm surge (advisory 1)',
};

const LAYER_ORDER = ['flood_5yr', 'flood_25yr', 'flood_100yr', 'landslide', 'storm_surge'];

function pmtilesUrlFor(layerId) {
  const raw = process.env.NEXT_PUBLIC_NOAH_PMTILES_URL?.trim();
  return raw ? raw : null;
}

/**
 * The hazard class field is NOT named consistently across NOAH layers: the
 * storm-surge shapefile carries `HAZ`, the flood shapefile carries `Var` (both
 * 1–3). Reading a fixed name silently produced `hazard_class: null` on every
 * flood feature, which would have shipped a hazard map with no severity. Resolve
 * the field from the layer's own properties instead.
 */
function resolveClassField(features) {
  const candidates = ['HAZ', 'haz', 'Var', 'VAR', 'var', 'Hazard', 'HAZARD', 'hazard'];
  for (const name of candidates) {
    if (features.some((f) => f.properties?.[name] != null)) return name;
  }
  // Fall back to any numeric-looking property that stays inside the 1–4 scale.
  const numeric = new Set();
  for (const f of features.slice(0, 200)) {
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (k === 'OBJECTID' || k === 'FID' || k === 'Id') continue;
      const n = Number(v);
      if (Number.isFinite(n) && n >= 1 && n <= 4) numeric.add(k);
    }
  }
  return numeric.size === 1 ? [...numeric][0] : null;
}

function classOf(properties, classField) {
  const raw = classField ? properties?.[classField] : null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 4 ? Math.round(n) : null;
}

async function laboBoundary() {
  try {
    const fc = JSON.parse(await readFile(paths.municipalityGeoJson, 'utf8'));
    if (fc.features?.[0]) return fc.features[0];
  } catch {
    /* fall through to the barangay file */
  }
  const barangays = JSON.parse(await readFile(paths.barangayGeoJson, 'utf8'));
  const first = barangays.features?.[0];
  if (!first) throw new Error('No Labo boundary available — run `npm run etl barangays` first');
  // Fall back to the barangay-set bounding box expressed as a polygon.
  const [minX, minY, maxX, maxY] = bboxOf(barangays);
  return {
    type: 'Feature',
    properties: { name: 'Labo (barangay bounding box)' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [minX, minY],
          [maxX, minY],
          [maxX, maxY],
          [minX, maxY],
          [minX, minY],
        ],
      ],
    },
  };
}

function toFeatureCollectionFromShp(parsed, sourceName) {
  if (!parsed) return null;
  if (Array.isArray(parsed)) {
    // shpjs returns one entry per file in the zip; pick the one with features.
    const withFeatures = parsed.filter((p) => p?.features?.length);
    if (withFeatures.length === 0) return null;
    if (withFeatures.length > 1) {
      log(`  ${sourceName}: ${withFeatures.length} layers in the archive, merging`);
      return {
        type: 'FeatureCollection',
        features: withFeatures.flatMap((p) => p.features),
      };
    }
    return withFeatures[0];
  }
  return parsed;
}

async function compileLayer(layerId, url, opts, boundary, boundaryBbox) {
  const { force, offline, cachedOnly } = opts;
  const dest = join(paths.cacheDir, `noah_${layerId}_CamarinesNorte.zip`);
  const outFile = `labo-${layerId.replaceAll('_', '-')}.geojson`;
  const outPath = join(paths.publicDataDir, 'hazards', outFile);

  let archivePresent = existsSync(dest);
  let downloadError = null;
  if (!archivePresent && !offline && !cachedOnly) {
    try {
      await downloadToFile(url, dest, {
        force,
        timeout: Number(process.env.ETL_HTTP_TIMEOUT_MS ?? 3_600_000),
        logEveryBytes: 16 * 1024 * 1024,
      });
      archivePresent = true;
    } catch (err) {
      downloadError = err?.message ?? String(err);
    }
  }
  if (!archivePresent && cachedOnly) {
    downloadError = 'running with --cached-only and the archive is not in the ETL cache';
  }

  if (!archivePresent) {
    return {
      meta: {
        id: layerId,
        label: LAYER_LABELS[layerId] ?? layerId,
        file: null,
        featureCount: null,
        mode: 'absent',
        remoteUrl: pmtilesUrlFor(layerId),
        sourceId: SOURCES.noah.id,
        note: downloadError
          ? `Province archive could not be downloaded in this run (${downloadError}). Fetch it manually from ${url} into ${paths.cacheDir} and re-run \`npm run etl hazards\`.`
          : `Province archive not present in ${paths.cacheDir}. Download it from ${url} and re-run \`npm run etl hazards\`.`,
      },
      bytes: 0,
      sha256: null,
      cancelled: Boolean(downloadError),
    };
  }

  /**
   * A cached archive is not trusted on its name alone. An interrupted download
   * leaves a truncated file that `downloadToFile` would otherwise skip forever,
   * and `adm-zip` then fails with "No END header found" — which reads like a code
   * bug rather than a half-finished transfer. Verify the central directory opens,
   * and re-fetch once if it does not.
   */
  let entries;
  try {
    entries = new AdmZip(dest).getEntries().map((e) => e.entryName);
  } catch (err) {
    const { size } = await stat(dest);
    log(
      `  ${layerId}: cached archive (${(size / 1e6).toFixed(1)} MB) is not readable — ${err?.message ?? err}; re-downloading`,
    );
    if (!offline && !cachedOnly) {
      try {
        await downloadToFile(url, dest, { force: true, timeout: 3_600_000 });
        entries = new AdmZip(dest).getEntries().map((e) => e.entryName);
      } catch (again) {
        return {
          meta: {
            id: layerId,
            label: LAYER_LABELS[layerId] ?? layerId,
            file: null,
            featureCount: null,
            mode: 'absent',
            remoteUrl: pmtilesUrlFor(layerId),
            sourceId: SOURCES.noah.id,
            note: `Province archive is incomplete or corrupt (${(size / 1e6).toFixed(1)} MB cached; ${again?.message ?? again}). Delete it from ${paths.cacheDir} and re-run \`npm run etl hazards\`.`,
          },
          bytes: 0,
          sha256: null,
          cancelled: true,
        };
      }
    } else {
      return {
        meta: {
          id: layerId,
          label: LAYER_LABELS[layerId] ?? layerId,
          file: null,
          featureCount: null,
          mode: 'absent',
          remoteUrl: pmtilesUrlFor(layerId),
          sourceId: SOURCES.noah.id,
          note: `The cached province archive is incomplete (${(size / 1e6).toFixed(1)} MB) — the transfer was interrupted. Delete it from ${paths.cacheDir} and re-run without --cached-only.`,
        },
        bytes: 0,
        sha256: null,
        cancelled: true,
      };
    }
  }

  log(`  ${layerId}: archive entries ${entries.join(', ')}`);

  const shp = await loadShp();
  const parsed = await shp(await readFile(dest));
  const fc = toFeatureCollectionFromShp(parsed, layerId);
  if (!fc) throw new Error(`${layerId}: the archive produced no features`);

  const features = [];
  let bboxRejected = 0;
  let exactClips = 0;
  let bboxFallbacks = 0;
  let piecesDroppedOutside = 0;
  let tolerance = SIMPLIFY_TOLERANCE;
  const classField = resolveClassField(fc.features);
  log(`  ${layerId}: hazard class field resolved to ${classField ?? 'NONE FOUND'}`);

  const build = () => {
    features.length = 0;
    bboxRejected = 0;
    exactClips = 0;
    bboxFallbacks = 0;
    piecesDroppedOutside = 0;
    for (const feature of fc.features) {
      const fb = bboxOf(feature);
      if (!bboxesOverlap(fb, boundaryBbox)) {
        bboxRejected += 1;
        continue;
      }
      const { feature: clipped, exact } = clipToPolygon(feature, boundary);
      if (!clipped) {
        bboxRejected += 1;
        continue;
      }
      if (exact) exactClips += 1;
      else bboxFallbacks += 1;
      // Drop the bbox-clipped pieces that belong to a neighbouring municipality.
      const inside = filterPolygonsInside(clipped, boundary.geometry);
      piecesDroppedOutside += inside.dropped;
      if (!inside.feature) {
        bboxRejected += 1;
        continue;
      }
      const simplified = simplifyFeature(inside.feature, tolerance);
      const props = feature.properties ?? {};
      const rounded = roundCoordinates(simplified.geometry, COORD_PRECISION);
      features.push({
        type: 'Feature',
        properties: {
          hazard_class: classOf(props, classField),
          hazard_label: hazardLabel(classOf(props, classField)),
          layer: layerId,
        },
        geometry: rounded,
      });
    }
  };

  build();

  /**
   * A layer that compiles to zero features is not an empty layer — it is a
   * verified finding: no part of Labo falls inside this hazard zone. Reporting it
   * as `static` with an empty file would put a toggle in the UI that does
   * nothing; reporting it as `none-in-area` lets the map say so in words. A stale
   * file from an earlier run is removed so nothing stale is ever served.
   */
  if (features.length === 0) {
    await rm(outPath, { force: true });
    await rm(`${outPath}.sha256`, { force: true });
    return {
      meta: {
        id: layerId,
        label: LAYER_LABELS[layerId] ?? layerId,
        file: null,
        featureCount: 0,
        mode: 'none-in-area',
        remoteUrl: pmtilesUrlFor(layerId),
        sourceId: SOURCES.noah.id,
        note: `The Camarines Norte archive was compiled and analysed, and no part of Labo falls inside this layer's hazard zones: all ${fc.features.length} province-level feature(s) were rejected by a point-in-polygon test against the municipal outline. This is a result, not a missing layer.`,
      },
      bytes: 0,
      sha256: await sha256File(dest),
      cancelled: false,
    };
  }

  let written = await writeGeoJson(outPath, toFeatureCollection(features));
  while (written.bytes > MAX_LAYER_BYTES && tolerance < 0.01) {
    tolerance *= 2;
    log(`  ${layerId}: ${(written.bytes / 1e6).toFixed(1)} MB over the ${MAX_LAYER_BYTES / 1e6} MB budget — re-simplifying at ${tolerance}°`);
    build();
    written = await writeGeoJson(outPath, toFeatureCollection(features));
  }

  const notes = [
    `Clipped from ${fc.features.length} province-level features; ${bboxRejected} were dropped after the bounding-box pass.`,
    exactClips > 0
      ? `${exactClips} feature(s) intersected with the municipal outline exactly.`
      : null,
    bboxFallbacks > 0
      ? `${bboxFallbacks} feature(s) fell back to a bounding-box clip because the upstream contour could not be intersected exactly (it self-intersects), so their outer boundary may include a sliver of a neighbouring municipality.`
      : null,
    piecesDroppedOutside > 0
      ? `${piecesDroppedOutside} polygon piece(s) whose interior point fell outside the Labo outline were discarded, so hazard belonging to neighbouring municipalities is not shown here.`
      : null,
    `Simplified at ${tolerance}° tolerance to keep the layer under ${MAX_LAYER_BYTES / 1e6} MB.`,
    'Hazard classes follow the Project NOAH legend in the per-layer readme PDF that ships inside the province archive.',
  ].filter(Boolean);

  return {
    meta: {
      id: layerId,
      label: LAYER_LABELS[layerId] ?? layerId,
      file: `hazards/${outFile}`,
      featureCount: features.length,
      mode: 'static',
      remoteUrl: pmtilesUrlFor(layerId),
      sourceId: SOURCES.noah.id,
      note: notes.join(' '),
    },
    bytes: written.bytes,
    sha256: await sha256File(dest),
    cancelled: false,
  };
}

export async function run(ctx) {
  const src = SOURCES.noah;
  const boundary = await laboBoundary();
  const boundaryBbox = bboxOf(boundary);
  log(`hazards: clipping to [${boundaryBbox.map((n) => n.toFixed(4)).join(', ')}]`);

  const layers = [];
  const outputs = ['apps/web/public/data/hazards.json'];
  let bytes = 0;
  let sha256 = null;
  let anyAnalysed = false;
  let networkFailures = 0;

  for (const layerId of LAYER_ORDER) {
    const url = src.provinceArchives[layerId];
    if (!url) continue;
    const result = await compileLayer(layerId, url, ctx, boundary, boundaryBbox);
    layers.push(result.meta);
    if (result.meta.mode === 'static') {
      anyAnalysed = true;
      outputs.push(`apps/web/public/data/${result.meta.file}`);
      bytes += result.bytes;
      sha256 ??= result.sha256;
      log(`hazards/${layerId}: ${result.meta.featureCount} features → ${result.meta.file}`);
    } else if (result.meta.mode === 'none-in-area') {
      // Compiled and analysed: the layer legitimately has no Labo coverage.
      anyAnalysed = true;
      sha256 ??= result.sha256;
      log(`hazards/${layerId}: compiled, but no Labo coverage`);
    } else {
      if (result.cancelled) networkFailures += 1;
      log(`hazards/${layerId}: not compiled (${result.meta.mode})`);
    }
  }

  await writeStableJson(paths.hazards, {
    municipality: 'Labo',
    layers,
    note: anyAnalysed
      ? 'Static clipped layers are served from /data/hazards/. A layer marked "none-in-area" was compiled and analysed and genuinely has no Labo coverage — that is a finding, not a gap. A layer marked "remote" is streamed from Project NOAH’s published tile archive by HTTP range request and is not a copy held in this repository.'
      : 'No hazard layer could be compiled yet. The map shows the municipal and barangay boundaries only, and says so.',
    sources: [src.id],
  });

  if (anyAnalysed) {
    const analysed = layers.filter((l) => l.mode === 'static' || l.mode === 'none-in-area');
    const uncompiled = layers.filter((l) => l.mode !== 'static' && l.mode !== 'none-in-area');
    await recordProvenance({
      id: src.id,
      title: src.title,
      publisher: src.publisher,
      portalDatasetId: src.portalDatasetId,
      portalUrl: src.portalUrl,
      sourceUrl: src.provinceArchives.flood_5yr,
      license: src.license,
      licenseUrl: src.licenseUrl,
      attributionText: src.attributionText,
      retrievedAt: new Date().toISOString(),
      sourceVersion: src.sourceVersion,
      rowCount: layers.reduce((n, l) => n + (l.featureCount ?? 0), 0),
      bytes: bytes || null,
      sha256,
      outputs,
      notes: `Per-province shapefile archives for Camarines Norte, clipped to the Labo municipal outline with a point-in-polygon test. Analysed: ${analysed
        .map((l) => `${l.id} (${l.mode}, ${l.featureCount ?? 0} features)`)
        .join(', ')}.${uncompiled.length > 0 ? ` Not compiled: ${uncompiled.map((l) => l.id).join(', ')}.` : ''}`,
      unavailable: false,
    });
  } else {
    await recordUnavailable(
      src,
      networkFailures > 0
        ? 'the Camarines Norte province archives could not be downloaded in this run (HuggingFace egress may be throttled)'
        : 'no province archive was present in the ETL cache',
    );
  }

  log(
    `hazards: ${layers.filter((l) => l.mode === 'static').length} static, ${layers.filter((l) => l.mode === 'none-in-area').length} verified-empty, ${layers.filter((l) => l.mode === 'absent').length} absent`,
  );

  await compileBarangayExposure(layers);
}

/**
 * Per-barangay hazard exposure.
 *
 * A hazard polygon covering the municipality is not actionable; "Barangay Baay
 * is in the high flood zone" is. For each of the 52 barangays this classifies the
 * barangay CENTROID against every static layer and records the highest hazard
 * class found, so the directory and the map popup can both answer the question a
 * resident actually asks.
 *
 * The method is recorded in the file because a centroid classification is a
 * sample, not a coverage calculation: a barangay whose populated centre is safe
 * but whose far edge is in the zone reads as safe here, and the file says so.
 */
async function compileBarangayExposure(layers) {
  const staticLayers = layers.filter((l) => l.mode === 'static' && l.file);
  if (staticLayers.length === 0) return;

  let barangayGeo;
  try {
    barangayGeo = JSON.parse(await readFile(paths.barangayGeoJson, 'utf8'));
  } catch {
    log('hazards/exposure: labo-barangays.geojson missing — run `npm run etl barangays` first');
    return;
  }

  const barangays = barangayGeo.features
    .map((f) => ({
      psgcCode: f.properties.psgc_code,
      name: f.properties.name,
      geometry: f.geometry,
      bbox: bboxOf(f),
    }))
    .filter((b) => b.psgcCode && b.geometry);

  // Flatten every hazard layer into individually testable patches.
  const patches = [];
  for (const layer of staticLayers) {
    let fc;
    try {
      fc = JSON.parse(await readFile(join(paths.publicDataDir, layer.file), 'utf8'));
    } catch (err) {
      log(`hazards/exposure: could not read ${layer.file} (${err?.message ?? err})`);
      continue;
    }
    for (const feature of fc.features) {
      const cls = feature.properties?.hazard_class ?? null;
      const polys =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates;
      for (const poly of polys) {
        const ring = poly?.[0];
        if (!ring || ring.length < 3) continue;
        const bbox = bboxOf({ type: 'Feature', geometry: { type: 'Polygon', coordinates: poly } });
        // A representative interior point of the patch.
        let sx = 0;
        let sy = 0;
        for (const [x, y] of ring) {
          sx += x;
          sy += y;
        }
        patches.push({
          layerId: layer.id,
          cls,
          bbox,
          point: [sx / ring.length, sy / ring.length],
          ring,
        });
      }
    }
  }
  if (patches.length === 0) return;

  let exposedCount = 0;
  const rows = barangays.map((barangay) => {
    const centre = [
      barangay.bbox[0] + (barangay.bbox[2] - barangay.bbox[0]) / 2,
      barangay.bbox[1] + (barangay.bbox[3] - barangay.bbox[1]) / 2,
    ];
    const exposure = {};
    const patchCounts = {};
    for (const layer of staticLayers) {
      let best = null;
      let count = 0;
      for (const patch of patches) {
        if (patch.layerId !== layer.id) continue;
        if (!bboxesOverlap(patch.bbox, barangay.bbox)) continue;
        // Reverse (the meaningful direction): does this mapped patch sit inside
        // the barangay? A barangay whose centre is outside every patch can still
        // contain mapped hazard along its river or coast.
        const patchInside = pointInGeometry(patch.point, barangay.geometry);
        // Forward: is the barangay's centre inside this patch?
        const centreInside = pointInGeometry(centre, {
          type: 'Polygon',
          coordinates: [patch.ring],
        });
        if (!patchInside && !centreInside) continue;
        count += 1;
        if (patch.cls != null && (best == null || patch.cls > best)) best = patch.cls;
      }
      exposure[layer.id] = best;
      patchCounts[layer.id] = count;
    }
    if (Object.values(exposure).some((v) => v != null)) exposedCount += 1;
    return { psgcCode: barangay.psgcCode, name: barangay.name, exposure, patchCounts };
  });

  await writeStableJson(join(paths.publicDataDir, 'barangay-exposure.json'), {
    municipality: 'Labo',
    method:
      'A barangay is marked as exposed when a mapped hazard patch lies inside its boundary polygon, or when the barangay centre falls inside a hazard patch. The class reported is the highest class among the patches that matched. This asks "is hazard mapped inside this barangay?", which is deliberately coarser than a share-of-area calculation — the count of matching patches is published alongside so the strength of the signal is visible.',
    classLegend: { 1: 'Low', 2: 'Moderate', 3: 'High', 4: 'Very high' },
    layers: staticLayers.map((l) => ({ id: l.id, label: l.label })),
    counts: {
      barangays: rows.length,
      withAnyExposure: exposedCount,
      withoutAnyExposure: rows.length - exposedCount,
      patchesTested: patches.length,
    },
    barangays: rows,
    sources: [SOURCES.noah.id],
  });

  log(
    `hazards/exposure: ${exposedCount} of ${rows.length} barangays have mapped hazard inside their boundary (${patches.length} patches tested)`,
  );
}
