/**
 * TASK profile — the municipal profile card.
 *
 * Everything here is derived from the compiled barangay file plus the
 * municipality polygon, so the numbers always agree with the map. Fields the
 * brief asks for that no wired source provides are listed under `pendingFields`
 * instead of being filled with a plausible-looking guess.
 */
import { readFile } from 'node:fs/promises';

import { areaKm2, bboxOf } from '../lib/geo.mjs';
import { log } from '../lib/http.mjs';
import { paths } from '../lib/paths.mjs';
import { PENDING_FIELDS } from '../lib/sources.mjs';
import { writeStableJson } from '../lib/write.mjs';

export async function run() {
  const index = JSON.parse(await readFile(paths.barangayIndex, 'utf8'));
  const municipality = JSON.parse(await readFile(paths.municipalityGeoJson, 'utf8'));
  const feature = municipality.features[0];

  const barangays = index.barangays;
  const bounds = bboxOf(feature).map((n) => Number(n.toFixed(6)));
  const areaSqKm = feature.properties.area_sqkm ?? areaKm2(feature);

  // Area-weighted centroid of the barangay set — a better map anchor than the
  // geometric centroid of a concave municipality outline.
  const totalArea = barangays.reduce((s, b) => s + b.areaSqKm, 0) || 1;
  const centroid = {
    lat: barangays.reduce((s, b) => s + b.centroid.lat * b.areaSqKm, 0) / totalArea,
    lng: barangays.reduce((s, b) => s + b.centroid.lng * b.areaSqKm, 0) / totalArea,
  };

  const poblacion = barangays.filter((b) => b.isPoblacion);
  const inland = barangays.filter((b) => !b.isPoblacion);

  await writeStableJson(paths.profile, {
    name: 'Labo',
    officialName: 'Municipality of Labo',
    psgcCode: index.municipalityPsgcCode,
    psgcId: 'PH0501606',
    province: feature.properties.province,
    provincePsgcCode: '0501600000',
    region: feature.properties.region,
    islandGroup: 'Luzon',
    // The "1st class" status is the brief's assertion; the income-class field is
    // left null until a classification source is wired, and the brief's value is
    // surfaced in the UI as a claim pending verification.
    incomeClass: null,
    areaSqKm: Number(areaSqKm.toFixed(6)),
    barangayCount: barangays.length,
    centroid: {
      lat: Number(centroid.lat.toFixed(6)),
      lng: Number(centroid.lng.toFixed(6)),
    },
    bounds,
    counts: {
      poblacion: poblacion.length,
      inland: inland.length,
      withPopulationData: barangays.filter((b) => b.population != null).length,
    },
    largestBarangays: [...barangays]
      .sort((a, b) => b.areaSqKm - a.areaSqKm)
      .slice(0, 5)
      .map((b) => ({ name: b.name, areaSqKm: b.areaSqKm })),
    pendingFields: PENDING_FIELDS,
    note:
      'Derived from the compiled barangay boundary file. The centroid is the area-weighted centroid of the 52 barangay polygons, not the municipal hall.',
    sources: ['psgc-barangay-boundaries'],
  });

  log(
    `profile: ${barangays.length} barangays, ${areaSqKm.toFixed(2)} km², bounds ${bounds.join(', ')}`,
  );
}
