/**
 * The framework-free half of the map module: layer ids, palette, basemap style,
 * the NOAH hazard-class normaliser and the translation from the compiled
 * registry into the options the layer panel renders.
 *
 * Nothing here touches the DOM or React, and every import from `maplibre-gl` is
 * type-only — so the server page can import this file to derive the hazard
 * options without pulling the map library into the server bundle.
 */
import type { Feature, FeatureCollection } from 'geojson';
import type { StyleSpecification } from 'maplibre-gl';

import type { BarangayRecord, HazardLayerMeta } from '@betterlabo/shared';
import { formatNumber, stripPoblacionSuffix } from '@betterlabo/shared';

import type {
  HazardClassCount,
  HazardClassId,
  HazardOption,
  HazardRuntime,
  MapBarangay,
} from './types';

/* ───────────────────────────── identifiers ───────────────────────────── */

export const SOURCE_IDS = {
  basemap: 'labo-basemap',
  barangays: 'labo-barangays',
  municipality: 'labo-municipality',
  hazard: 'labo-hazard',
} as const;

export const LAYER_IDS = {
  basemap: 'labo-basemap-layer',
  barangayFill: 'labo-barangay-fill',
  barangayOutline: 'labo-barangay-outline',
  barangaySelected: 'labo-barangay-selected',
  barangayLabels: 'labo-barangay-labels',
  municipalityOutline: 'labo-municipality-outline',
  hazardFill: 'labo-hazard-fill',
  hazardOutline: 'labo-hazard-outline',
} as const;

/** Which layers a toggle in the panel drives. */
export const TOGGLE_LAYERS = {
  boundaries: [LAYER_IDS.barangayFill, LAYER_IDS.barangayOutline],
  labels: [LAYER_IDS.barangayLabels],
  municipality: [LAYER_IDS.municipalityOutline],
  hazard: [LAYER_IDS.hazardFill, LAYER_IDS.hazardOutline],
} as const;

/**
 * Basemap attribution for the CARTO Voyager raster basemap, plus the notice for
 * the glyph server the label layer uses. Both are shown in the legend.
 */
export const GLYPHS_URL = 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf';
export const GLYPHS_ATTRIBUTION = 'MapLibre demo font server';

/* ─────────────────────────────── palette ─────────────────────────────── */

export const MAP_COLOURS = {
  barangayFill: '#0787ff',
  poblacionFill: '#fcd116',
  hoverFill: '#35b0ff',
  selectedFill: '#0038a8',
  outline: '#0052d6',
  outlineStrong: '#062365',
  /** Shown when a hazard polygon carries a class the normaliser cannot read. */
  hazardUnclassified: '#6f7c88',
} as const;

export interface HazardClassMeta {
  id: HazardClassId;
  label: string;
  colour: string;
  description: string;
}

/**
 * The four NOAH hazard classes the design system defines. The ramp is the same
 * one `globals.css` exposes as `hazard-low` … `hazard-veryhigh`, repeated here
 * because MapLibre paint properties need literal colours.
 */
export const HAZARD_CLASSES: ReadonlyArray<HazardClassMeta> = [
  {
    id: 'low',
    label: 'Low',
    colour: '#aedfff',
    description: 'Shallow or infrequent flooding; roads usually passable.',
  },
  {
    id: 'moderate',
    label: 'Moderate',
    colour: '#fcd116',
    description: 'Flooding possible in sustained rain; monitor advisories.',
  },
  {
    id: 'high',
    label: 'High',
    colour: '#fc9416',
    description: 'Frequent flooding; plan routes that avoid the area.',
  },
  {
    id: 'very_high',
    label: 'Very high',
    colour: '#ce1226',
    description: 'Deep or fast-moving water; highest evacuation priority.',
  },
];

const HAZARD_CLASS_BY_ID = new Map<HazardClassId, HazardClassMeta>(
  HAZARD_CLASSES.map((entry) => [entry.id, entry]),
);

export function hazardClassMeta(id: HazardClassId): HazardClassMeta {
  const meta = HAZARD_CLASS_BY_ID.get(id);
  if (meta) return meta;
  // Unreachable with the ids the normaliser can return, but keeps the caller total.
  return { id, label: id, colour: MAP_COLOURS.hazardUnclassified, description: '' };
}

/* ───────────────────── hazard class normalisation ───────────────────── */

/**
 * Property names a NOAH-derived hazard file may carry its class in. The ETL is
 * the only writer of these files, and its schema is not frozen, so the reader
 * probes instead of assuming one name.
 */
const HAZARD_CLASS_KEYS = [
  'hazard',
  'hazard_class',
  'hazardClass',
  'hazard_level',
  'hazard_level_num',
  'class',
  'var',
  'level',
  'risk',
  'susceptibility',
] as const;

const HAZARD_CLASS_LABELS: Record<string, HazardClassId> = {
  'very high': 'very_high',
  veryhigh: 'very_high',
  very_high: 'very_high',
  high: 'high',
  moderate: 'moderate',
  medium: 'moderate',
  low: 'low',
  none: 'low',
  '1': 'low',
  '2': 'moderate',
  '3': 'high',
  '4': 'very_high',
};

/**
 * Maps any value a hazard polygon might carry onto one of the four classes, or
 * `null` when it cannot be read. `null` is rendered as "Unclassified" — never
 * silently promoted to a class, which would understate or overstate a risk.
 */
export function normalizeHazardClass(value: unknown): HazardClassId | null {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return HAZARD_CLASS_LABELS[String(Math.trunc(value))] ?? null;
  }
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  if (!key) return null;
  if (HAZARD_CLASS_LABELS[key]) return HAZARD_CLASS_LABELS[key];
  // Free-text descriptions such as "High (flood)" — match on the leading word.
  const collapsed = key.replace(/\s+/g, '_');
  if (HAZARD_CLASS_LABELS[collapsed]) return HAZARD_CLASS_LABELS[collapsed];
  for (const [label, id] of Object.entries(HAZARD_CLASS_LABELS)) {
    if (key.startsWith(`${label} `) || key.startsWith(`${label}(`)) return id;
  }
  return null;
}

export interface PreparedHazard {
  data: FeatureCollection;
  /** The property the class was read from, or `null` when none could be found. */
  classKey: string | null;
  /** Classes actually present in the file, with feature counts. */
  classes: HazardClassCount[];
  featureCount: number;
  /** Features whose class could not be read — drawn in the neutral tint. */
  unclassified: number;
}

/**
 * Annotates a fetched hazard FeatureCollection with a normalised `__hazard`
 * property, so the MapLibre paint expression is a plain `match` on four known
 * tokens instead of a chain of string comparisons in the style language.
 *
 * Returns `null` when the payload is not a GeoJSON FeatureCollection.
 */
export function prepareHazardGeoJson(raw: unknown): PreparedHazard | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as { type?: unknown; features?: unknown };
  if (candidate.type !== 'FeatureCollection' || !Array.isArray(candidate.features)) return null;

  const features = candidate.features.filter(
    (feature): feature is Feature => typeof feature === 'object' && feature !== null,
  );

  const classKey = detectHazardClassKey(features);
  const counts = new Map<HazardClassId, number>();
  let unclassified = 0;

  const annotated: Feature[] = features.map((feature) => {
    const properties: Record<string, unknown> = { ...(feature.properties ?? {}) };
    const value = classKey ? properties[classKey] : undefined;
    const normalised = normalizeHazardClass(value);
    if (normalised) {
      properties['__hazard'] = normalised;
      counts.set(normalised, (counts.get(normalised) ?? 0) + 1);
    } else {
      unclassified += 1;
    }
    return { ...feature, properties };
  });

  const classes: HazardClassCount[] = HAZARD_CLASSES.filter((entry) => (counts.get(entry.id) ?? 0) > 0).map(
    (entry) => ({ id: entry.id, count: counts.get(entry.id) ?? 0 }),
  );

  return {
    data: { type: 'FeatureCollection', features: annotated },
    classKey,
    classes,
    featureCount: annotated.length,
    unclassified,
  };
}

/** The first candidate property that reads as a hazard class on any feature. */
function detectHazardClassKey(features: Feature[]): string | null {
  for (const key of HAZARD_CLASS_KEYS) {
    for (const feature of features) {
      const properties = feature.properties as Record<string, unknown> | null;
      if (properties && normalizeHazardClass(properties[key])) return key;
    }
  }
  return null;
}

/** Paint colour expression for a prepared (static) hazard source. */
export function hazardMatchExpression(): unknown {
  const expression: unknown[] = ['match', ['get', '__hazard']];
  for (const entry of HAZARD_CLASSES) {
    expression.push(entry.id, entry.colour);
  }
  expression.push(MAP_COLOURS.hazardUnclassified);
  return expression;
}

/**
 * Paint colour expression for a streamed vector-tile hazard source, where the
 * class cannot be normalised in advance. Falls back to the neutral tint.
 */
export function hazardVectorExpression(field: string): unknown {
  // `case` is evaluated in order, so the most severe classes are tested first.
  const expression: unknown[] = ['case'];
  for (const entry of [...HAZARD_CLASSES].reverse()) {
    expression.push(
      ['in', ['downcase', ['to-string', ['get', field]]], ['literal', tokensFor(entry.id)]],
      entry.colour,
    );
  }
  expression.push(MAP_COLOURS.hazardUnclassified);
  return expression;
}

function tokensFor(id: HazardClassId): string[] {
  switch (id) {
    case 'very_high':
      return ['very high', 'very_high', 'veryhigh', '4', 'vh'];
    case 'high':
      return ['high', '3'];
    case 'moderate':
      return ['moderate', 'medium', '2'];
    default:
      return ['low', 'none', '1'];
  }
}

/* ──────────────────────── compiled hazard registry ─────────────────────── */
const HAZARD_LAYER_LABELS: Record<HazardLayerMeta['id'], string> = {
  flood_5yr: 'Flood — 5-year return period',
  flood_25yr: 'Flood — 25-year return period',
  flood_100yr: 'Flood — 100-year return period',
  landslide: 'Rain-induced landslide',
  debris_flow: 'Debris flow',
  storm_surge: 'Storm surge',
};

export interface HazardOptionInput {
  /** `hazards.json` contents, or `null` when the file has not been compiled. */
  layers: HazardLayerMeta[] | null;
  /** `NEXT_PUBLIC_NOAH_PMTILES_URL` — empty string when unset. */
  pmtilesUrl: string;
  /** `NEXT_PUBLIC_NOAH_PMTILES_ATTRIBUTION`. */
  pmtilesAttribution: string;
}

/**
 * Turns the registry plus the environment into the list of overlays the panel
 * offers. Order is: things that can be drawn, then the streamed archive, then
 * the declared-but-absent entries, so the first entry is always the best one.
 */
export function deriveHazardOptions(input: HazardOptionInput): HazardOption[] {
  const drawable: HazardOption[] = [];
  const unavailable: HazardOption[] = [];
  const declared = input.layers ?? [];
  let hasRemote = false;

  for (const layer of declared) {
    const label = layer.label || HAZARD_LAYER_LABELS[layer.id] || layer.id;
    if (layer.mode === 'static' && layer.file) {
      drawable.push({
        id: layer.id,
        label,
        mode: 'static',
        ready: true,
        detail:
          layer.featureCount == null
            ? 'Compiled into this repository as a static GeoJSON layer — no network request, no live service.'
            : `${formatNumber(layer.featureCount)} mapped hazard areas, compiled into this repository — no network request, no live service.`,
        url: `/data/${layer.file}`,
        featureCount: layer.featureCount,
        attribution: null,
        sourceId: layer.sourceId,
        note: layer.note,
      });
      continue;
    }

    const remoteUrl = layer.remoteUrl ?? (input.pmtilesUrl || null);
    if (layer.mode === 'remote' && remoteUrl) {
      hasRemote = true;
      drawable.push({
        id: layer.id,
        label,
        mode: 'remote',
        ready: true,
        detail:
          'Streamed on demand from a published PMTiles archive — a remote, live-fetched layer, not a copy clipped to Labo.',
        url: remoteUrl,
        featureCount: layer.featureCount,
        attribution: input.pmtilesAttribution || null,
        sourceId: layer.sourceId,
        note: layer.note,
      });
      continue;
    }

    unavailable.push({
      id: layer.id,
      label,
      mode: 'absent',
      ready: false,
      detail:
        layer.note ??
        'Declared in the hazard registry, but no compiled file ships with this build, so it cannot be drawn.',
      url: null,
      featureCount: null,
      attribution: null,
      sourceId: layer.sourceId,
      note: layer.note,
    });
  }

  if (!hasRemote && input.pmtilesUrl) {
    drawable.push({
      id: 'noah-pmtiles',
      label: 'Project NOAH hazard tiles (streamed)',
      mode: 'remote',
      ready: true,
      detail:
        'Streamed on demand from the published NOAH PMTiles archive. A remote, live-fetched layer: it is not clipped to Labo, it is not cached in this repository, and it needs a connection every time it is switched on.',
      url: input.pmtilesUrl,
      featureCount: null,
      attribution: input.pmtilesAttribution || null,
      sourceId: 'noah-hazard-maps',
      note: null,
    });
  }

  return [...drawable, ...unavailable];
}

/* ────────────────────────────── basemap ────────────────────────────── */

export interface BasemapInput {
  tileUrl: string;
  attribution: string;
  glyphsUrl?: string | null;
}

/**
 * The whole basemap: one raster source. No sprite, no glyphs unless the label
 * layer is in play, so switching the map on costs a single tile request.
 */
export function buildBasemapStyle({ tileUrl, attribution, glyphsUrl }: BasemapInput): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {
      [SOURCE_IDS.basemap]: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: 19,
        attribution,
      },
    },
    layers: [
      {
        id: LAYER_IDS.basemap,
        type: 'raster',
        source: SOURCE_IDS.basemap,
        paint: { 'raster-opacity': 1, 'raster-fade-duration': 150 },
      },
    ],
  };
  if (glyphsUrl) style.glyphs = glyphsUrl;
  return style;
}

/** The map's first view: the municipality's own bounds, with a little air. */
export function paddedBounds(
  bounds: [number, number, number, number] | null,
  pad = 0.08,
): [number, number, number, number] | null {
  if (!bounds) return null;
  const [minLng, minLat, maxLng, maxLat] = bounds;
  return [minLng - pad, minLat - pad, maxLng + pad, maxLat + pad];
}

/* ──────────────────────── compiled barangay index ──────────────────────── */

/** `barangays.json` record → the shape the map island renders. */
export function toMapBarangay(record: BarangayRecord): MapBarangay {
  return {
    psgcCode: record.psgcCode,
    name: record.name,
    displayName: stripPoblacionSuffix(record.name),
    isPoblacion: record.isPoblacion,
    areaSqKm: record.areaSqKm ?? null,
    centroid: record.centroid ?? null,
    bbox: record.bbox ?? null,
    population: record.population ?? null,
    populationYear: record.populationYear ?? null,
  };
}

/** Path of the barangay detail page for a PSGC code. */
export function barangayHref(psgcCode: string): string {
  return `/barangays/${psgcCode}`;
}

/* ───────────────────────── barangay search ───────────────────────── */

/** Diacritic- and punctuation-insensitive form, so `pob` finds `Anahaw (Pob.)`. */
export function normalizeBarangayQuery(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Ranked prefix-then-substring search over the compiled index. An empty query
 * returns the first `limit` barangays alphabetically, so the combobox has
 * something to show the moment it is focused.
 */
export function searchBarangays(
  barangays: MapBarangay[],
  query: string,
  limit = 8,
): MapBarangay[] {
  const needle = normalizeBarangayQuery(query);
  if (!needle) {
    return [...barangays]
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .slice(0, limit);
  }
  const scored: Array<{ barangay: MapBarangay; score: number }> = [];
  for (const barangay of barangays) {
    const name = normalizeBarangayQuery(barangay.name);
    let score = -1;
    if (name === needle) score = 0;
    else if (name.startsWith(needle)) score = 1;
    else if (name.includes(needle)) score = 2;
    else if (barangay.psgcCode.startsWith(needle.replace(/\s+/g, ''))) score = 3;
    if (score >= 0) scored.push({ barangay, score });
  }
  scored.sort(
    (a, b) => a.score - b.score || a.barangay.displayName.localeCompare(b.barangay.displayName),
  );
  return scored.slice(0, limit).map((entry) => entry.barangay);
}

/* ─────────────────────────── hazard status ─────────────────────────── */

export interface HazardStatus {
  tone: 'default' | 'good' | 'warn' | 'bad';
  label: string;
  detail: string;
}

export interface HazardStatusInput {
  options: HazardOption[];
  /** The overlay the resident has switched on, if any. */
  activeId: string | null;
  runtime: HazardRuntime;
  /** Whether `hazards.json` exists at all. */
  hasRegistry: boolean;
}

/**
 * One sentence a resident can act on, derived from the registry, the switch and
 * what the map actually managed to draw. This is the whole point of the hazard
 * control: "live", "compiled-absent" and "streaming remotely" must never look
 * alike.
 */
export function describeHazardStatus({
  options,
  activeId,
  runtime,
  hasRegistry,
}: HazardStatusInput): HazardStatus {
  const active = options.find((option) => option.ready && option.id === activeId) ?? null;

  if (active && runtime.state === 'live') {
    return active.mode === 'static'
      ? {
          tone: 'good',
          label: 'Overlay live',
          detail: 'Drawn from a file compiled into this repository — no live service is involved.',
        }
      : {
          tone: 'warn',
          label: 'Streaming (remote)',
          detail:
            'Tiles are fetched live from a remote archive and are not clipped to Labo. Expect hazard areas outside the municipality.',
        };
  }
  if (active && runtime.state === 'loading') {
    return {
      tone: 'default',
      label: 'Loading overlay…',
      detail: active.mode === 'remote' ? 'Opening the remote archive.' : 'Reading the compiled file.',
    };
  }
  if (active && runtime.state === 'failed') {
    return {
      tone: 'bad',
      label: 'Overlay unavailable',
      detail:
        runtime.message ??
        'The overlay could not be drawn. The barangay boundaries below are unaffected.',
    };
  }

  const drawable = options.filter((option) => option.ready);
  if (drawable.length > 0) {
    return {
      tone: 'default',
      label: 'Overlay off',
      detail:
        'No hazard overlay is switched on. Barangay boundaries always come from the compiled PSA/NAMRIA file, not from this control.',
    };
  }
  if (!hasRegistry) {
    return {
      tone: 'warn',
      label: 'No hazard layer compiled',
      detail:
        'No hazard registry is compiled in this build, so no flood, landslide, debris-flow or storm-surge overlay can be drawn. No hazard is being hidden — there is simply nothing compiled yet.',
    };
  }
  return {
    tone: 'warn',
    label: 'No hazard layer available',
    detail:
      'The registry declares hazard layers, but none of them has a usable file or archive in this build.',
  };
}
