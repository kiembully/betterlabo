/**
 * GeoJSON helpers. Turf is used for area/centroid/bbox/clip/simplify so the
 * numbers in the compiled files are geodesic, not planar approximations.
 */
import area from '@turf/area';
import bboxClip from '@turf/bbox-clip';
import turfBbox from '@turf/bbox';
import centroid from '@turf/centroid';
import intersect from '@turf/intersect';
import simplify from '@turf/simplify';
import { featureCollection } from '@turf/helpers';

/** [minLng, minLat, maxLng, maxLat] */
export function bboxOf(geojson) {
  return turfBbox(geojson);
}

export function areaKm2(geojson) {
  return area(geojson) / 1e6;
}

/** Centroid of the largest ring set, returned as { lat, lng }. */
export function centroidLatLng(geojson) {
  const c = centroid(geojson);
  return { lat: c.geometry.coordinates[1], lng: c.geometry.coordinates[0] };
}

/** Recursively rounds every coordinate to `precision` decimals (~11 m at 4). */
export function roundCoordinates(node, precision = 5) {
  const f = 10 ** precision;
  if (Array.isArray(node)) {
    if (typeof node[0] === 'number') {
      return [Math.round(node[0] * f) / f, Math.round(node[1] * f) / f];
    }
    return node.map((child) => roundCoordinates(child, precision));
  }
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] =
        k === 'coordinates' && v && typeof v === 'object'
          ? roundCoordinatesCoordinates(v, precision)
          : v;
    }
    return out;
  }
  return node;
}

function roundCoordinatesCoordinates(coords, precision) {
  const f = 10 ** precision;
  if (Array.isArray(coords)) {
    if (typeof coords[0] === 'number') {
      return [Math.round(coords[0] * f) / f, Math.round(coords[1] * f) / f];
    }
    return coords.map((c) => roundCoordinatesCoordinates(c, precision));
  }
  return coords;
}

export function simplifyFeature(feature, toleranceDegrees) {
  try {
    return simplify(feature, { tolerance: toleranceDegrees, highQuality: true, mutate: false });
  } catch {
    return feature;
  }
}

/**
 * Hard-clip a feature to an arbitrary polygon. `bbox-clip` is used first
 * because it is fast and always valid; the exact `intersect` is then applied to
 * the remainder and only replaces it if it succeeds, so a self-intersecting
 * upstream polygon degrades to an over-inclusive clip instead of dropping the
 * feature (the count of such fallbacks is reported by the caller).
 */
export function clipToPolygon(feature, clipPolygon) {
  const clipped = bboxClip(feature, turfBbox(clipPolygon));
  if (!clipped || !clipped.geometry) return { feature: null, exact: false };
  if (clipped.geometry.type === 'GeometryCollection' && clipped.geometry.geometries.length === 0) {
    return { feature: null, exact: false };
  }
  try {
    const exact = intersect(featureCollection([clipped, clipPolygon]));
    if (exact && exact.geometry && exact.geometry.coordinates.length > 0) {
      return { feature: exact, exact: true };
    }
    return { feature: clipped, exact: false };
  } catch {
    return { feature: clipped, exact: false };
  }
}

export function toFeatureCollection(features) {
  return { type: 'FeatureCollection', features };
}

/** GeoJSON bbox intersection test — used to pre-filter before expensive clipping. */
export function bboxesOverlap(a, b) {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/**
 * NOAH hazard classes. Project NOAH publishes a 1–4 scale in the per-layer
 * readme PDF that ships inside each province archive; the shapefiles carry the
 * class as a float in the `HAZ` field.
 */
export const HAZARD_CLASS_LABELS = {
  1: 'Low',
  2: 'Moderate',
  3: 'High',
  4: 'Very high',
};

export function hazardLabel(value) {
  const n = Math.round(Number(value));
  return HAZARD_CLASS_LABELS[n] ?? `Class ${Number.isFinite(n) ? n : 'unknown'}`;
}

/* ─────────────────── point-in-polygon (no extra dependency) ─────────────────── */

/** Ray casting. `ring` is a closed [[lng,lat], …] array. */
function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInGeometry(point, geometry) {
  if (!geometry) return false;
  if (geometry.type === 'Polygon') {
    return pointInRing(point, geometry.coordinates[0] ?? []);
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates.some((poly) => pointInRing(point, poly[0] ?? []));
  }
  return false;
}

/** A point guaranteed to be inside a polygon ring: its vertex centroid, else a vertex. */
function representativePoint(rings) {
  const outer = rings?.[0] ?? [];
  if (outer.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of outer) {
    sx += x;
    sy += y;
  }
  const centroid = [sx / outer.length, sy / outer.length];
  if (pointInRing(centroid, outer)) return centroid;
  const mid = outer[Math.floor(outer.length / 2)];
  return mid ?? null;
}

/**
 * Keep only the polygon pieces that actually fall inside the municipality.
 *
 * This is the accuracy step that a bounding-box clip alone cannot give: Project
 * NOAH's storm-surge and flood contours span the whole province, so clipping them
 * to Labo's bbox also brings in hazard that belongs to the neighbouring
 * municipalities, which would read as "this inland barangay floods". Each piece's
 * representative interior point is tested against the municipal outline and the
 * outsiders are dropped.
 */
export function filterPolygonsInside(feature, boundaryGeometry) {
  const geom = feature.geometry;
  if (!geom) return { feature: null, dropped: 0, kept: 0 };

  if (geom.type === 'Polygon') {
    const point = representativePoint(geom.coordinates);
    if (!point || !pointInGeometry(point, boundaryGeometry)) return { feature: null, dropped: 1, kept: 0 };
    return { feature, dropped: 0, kept: 1 };
  }

  if (geom.type === 'MultiPolygon') {
    const keptPolygons = [];
    let dropped = 0;
    for (const poly of geom.coordinates) {
      const point = representativePoint(poly);
      if (point && pointInGeometry(point, boundaryGeometry)) keptPolygons.push(poly);
      else dropped += 1;
    }
    if (keptPolygons.length === 0) return { feature: null, dropped, kept: 0 };
    return {
      feature: { ...feature, geometry: { type: 'MultiPolygon', coordinates: keptPolygons } },
      dropped,
      kept: keptPolygons.length,
    };
  }

  return { feature: null, dropped: 1, kept: 0 };
}
