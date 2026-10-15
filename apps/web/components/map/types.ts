/**
 * Types shared by the client map island, the layer panel and the server page.
 *
 * They are deliberately plain data: every value the browser needs is computed on
 * the server from `public/data/*.json` and handed down as props, so the map
 * renders identically on the server shell and after hydration.
 */

/** A barangay as the map needs it — one record per PSA/NAMRIA polygon. */
export interface MapBarangay {
  psgcCode: string;
  /** Raw PSA name, e.g. `Anahaw (Pob.)`. */
  name: string;
  /** Name without the `(Pob.)` suffix, for dense lists and map labels. */
  displayName: string;
  isPoblacion: boolean;
  areaSqKm: number | null;
  centroid: { lat: number; lng: number } | null;
  /** `[minLng, minLat, maxLng, maxLat]` — used to frame a selected barangay. */
  bbox: [number, number, number, number] | null;
  population: number | null;
  populationYear: number | null;
}

/** How a hazard overlay would be drawn, or why it cannot be. */
export type HazardMode = 'static' | 'remote' | 'absent';

/**
 * One switchable hazard overlay. An option is always rendered in the panel —
 * including the ones that cannot be drawn — because "the flood layer is not
 * compiled in this build" is a fact a resident is entitled to see.
 */
export interface HazardOption {
  id: string;
  label: string;
  mode: HazardMode;
  /** `false` when the option is declared but cannot be drawn. */
  ready: boolean;
  /** One honest sentence: what this overlay is, or why it is unavailable. */
  detail: string;
  /** GeoJSON path for `static`, archive URL for `remote`. */
  url: string | null;
  featureCount: number | null;
  attribution: string | null;
  sourceId: string;
  note: string | null;
}

export type HazardClassId = 'low' | 'moderate' | 'high' | 'very_high';

export interface HazardClassCount {
  id: HazardClassId;
  count: number;
}

export type HazardRuntimeState = 'idle' | 'loading' | 'live' | 'failed';

/** What the map actually managed to draw for the active hazard overlay. */
export interface HazardRuntime {
  state: HazardRuntimeState;
  message: string | null;
  classes: HazardClassCount[];
  featureCount: number | null;
}

export interface LayerToggles {
  /** Barangay fill + outline. */
  boundaries: boolean;
  /** Barangay name labels (a separate glyph request, so off by default). */
  labels: boolean;
  /** The municipal outline. */
  municipality: boolean;
  /** The active hazard overlay. */
  hazard: boolean;
}

export type BasemapState = 'loading' | 'ready' | 'failed';
