'use client';

/**
 * The MapLibre island.
 *
 * It owns exactly one map instance for the life of the page and reacts to prop
 * changes instead of exposing an imperative handle, so the search box, the layer
 * panel and a click on a polygon all drive the same piece of state in the
 * explorer above it.
 *
 * Everything degrades in a designed way:
 *  - no WebGL / the library fails to load → an in-place card naming the reason;
 *  - the barangay GeoJSON is missing → the basemap stays up with a card naming
 *    the command that compiles it;
 *  - the basemap tiles never arrive → the compiled boundaries are still drawn,
 *    with a notice saying so.
 */
import 'maplibre-gl/dist/maplibre-gl.css';

import type { AddLayerObject, Map as MapLibreMap, MapMouseEvent, Popup as MapLibrePopup } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { buildBarangayPopup } from './barangay-popup';
import {
  LAYER_IDS,
  MAP_COLOURS,
  SOURCE_IDS,
  TOGGLE_LAYERS,
  buildBasemapStyle,
  hazardMatchExpression,
  hazardVectorExpression,
  prepareHazardGeoJson,
} from './map-config';
import { PmtilesReader, registerPmtilesProtocol } from './pmtiles';
import type {
  BasemapState,
  HazardOption,
  HazardRuntime,
  LayerToggles,
  MapBarangay,
} from './types';

type MapModule = typeof import('maplibre-gl');

export interface BarangayMapProps {
  center: { lat: number; lng: number };
  zoom: number;
  minZoom: number;
  maxZoom: number;
  /** Framed on first paint; falls back to `center`/`zoom`. */
  initialBounds: [number, number, number, number] | null;
  maxBounds: [number, number, number, number] | null;
  rasterTileUrl: string;
  rasterAttribution: string;
  /** Optional glyph server — only the label layer needs it. */
  glyphsUrl: string | null;
  geojsonUrl: string;
  municipalityUrl: string;
  barangays: MapBarangay[];
  hazard: HazardOption | null;
  toggles: LayerToggles;
  selectedPsgc: string | null;
  /** Set (with a fresh nonce) to fly the map to a barangay. */
  focus: { psgc: string; nonce: number } | null;
  /** Set (with a fresh nonce) to frame the whole municipality again. */
  resetNonce: number;
  /** Shown when the compiled data has not been produced yet. */
  etlHint: string;
  onSelect: (psgc: string | null) => void;
  onBasemapState: (state: BasemapState, message: string | null) => void;
  onHazardRuntime: (runtime: HazardRuntime) => void;
}

const IDLE_HAZARD: HazardRuntime = { state: 'idle', message: null, classes: [], featureCount: null };

export function BarangayMap(props: BarangayMapProps) {
  const {
    center,
    zoom,
    minZoom,
    maxZoom,
    initialBounds,
    maxBounds,
    rasterTileUrl,
    rasterAttribution,
    glyphsUrl,
    geojsonUrl,
    municipalityUrl,
    barangays,
    hazard,
    toggles,
    selectedPsgc,
    focus,
    resetNonce,
    etlHint,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  /** False once the map has been disposed, so late effect cleanups leave it alone. */
  const mapAliveRef = useRef(false);
  const moduleRef = useRef<MapModule | null>(null);
  const popupRef = useRef<MapLibrePopup | null>(null);
  const suppressPopupCloseRef = useRef(false);
  const hoveredRef = useRef<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const togglesRef = useRef<LayerToggles>(toggles);

  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [readyTick, setReadyTick] = useState(0);

  /** Latest callbacks, so the effects below never re-create the map. */
  const callbacksRef = useRef({
    onSelect: props.onSelect,
    onBasemapState: props.onBasemapState,
    onHazardRuntime: props.onHazardRuntime,
  });
  useEffect(() => {
    callbacksRef.current = {
      onSelect: props.onSelect,
      onBasemapState: props.onBasemapState,
      onHazardRuntime: props.onHazardRuntime,
    };
  });

  /** First-paint configuration is read once: the map is never re-created. */
  const bootRef = useRef({
    center,
    zoom,
    minZoom,
    maxZoom,
    initialBounds,
    maxBounds,
    rasterTileUrl,
    rasterAttribution,
    glyphsUrl,
    geojsonUrl,
    municipalityUrl,
    etlHint,
  });

  const barangayByPsgc = useMemo(
    () => new Map(barangays.map((barangay) => [barangay.psgcCode, barangay])),
    [barangays],
  );
  const barangayRef = useRef(barangayByPsgc);
  useEffect(() => {
    barangayRef.current = barangayByPsgc;
  }, [barangayByPsgc]);

  useEffect(() => {
    togglesRef.current = toggles;
  }, [toggles]);

  const closePopup = useCallback(() => {
    const popup = popupRef.current;
    if (!popup) return;
    popupRef.current = null;
    suppressPopupCloseRef.current = true;
    popup.remove();
    suppressPopupCloseRef.current = false;
  }, []);

  const openPopup = useCallback((barangay: MapBarangay) => {
    const map = mapRef.current;
    const maplibre = moduleRef.current;
    if (!map || !maplibre) return;

    const position =
      barangay.centroid ??
      (barangay.bbox
        ? {
            lng: (barangay.bbox[0] + barangay.bbox[2]) / 2,
            lat: (barangay.bbox[1] + barangay.bbox[3]) / 2,
          }
        : null);
    if (!position) return;

    let popup = popupRef.current;
    if (!popup) {
      popup = new maplibre.Popup({
        closeButton: true,
        closeOnClick: false,
        maxWidth: '19rem',
        offset: 14,
        className: 'labo-barangay-popup',
      });
      popup.on('close', () => {
        popupRef.current = null;
        if (!suppressPopupCloseRef.current) callbacksRef.current.onSelect(null);
      });
      popupRef.current = popup;
    }
    popup.setLngLat([position.lng, position.lat]).setDOMContent(buildBarangayPopup(barangay));
    // `addTo` detaches an already-attached popup first (which would fire `close`
    // and clear the selection), so the popup is only attached once.
    if (!popup.isOpen()) popup.addTo(map);
  }, []);

  /* ─────────────────────────── create the map ─────────────────────────── */

  useEffect(() => {
    let disposed = false;
    let map: MapLibreMap | null = null;

    const fail = (message: string) => {
      if (disposed) return;
      setPhase('failed');
      setNotice(message);
      callbacksRef.current.onBasemapState('failed', message);
    };

    const boot = async () => {
      const container = containerRef.current;
      if (!container) return;

      const config = bootRef.current;
      const maplibre = await import('maplibre-gl').catch(() => null);
      if (!maplibre) {
        fail(
          'The mapping library could not be downloaded. Reload the page — the barangay directory still lists every barangay with its area and position.',
        );
        return;
      }
      if (disposed) return;
      moduleRef.current = maplibre;

      try {
        map = new maplibre.Map({
          container,
          style: buildBasemapStyle({
            tileUrl: config.rasterTileUrl,
            attribution: config.rasterAttribution,
            glyphsUrl: config.glyphsUrl,
          }),
          center: [config.center.lng, config.center.lat],
          zoom: config.zoom,
          minZoom: config.minZoom,
          maxZoom: config.maxZoom,
          maxBounds: config.maxBounds ?? undefined,
          bounds: config.initialBounds ?? undefined,
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          logoPosition: 'top-left',
          fadeDuration: 120,
        });
      } catch (error) {
        fail(
          `This browser could not start the map: ${describe(error)}. A WebGL-capable browser is required for the interactive view.`,
        );
        return;
      }
      mapRef.current = map;
      mapAliveRef.current = true;

      // Controls live at the top so the mobile layer sheet cannot cover the
      // attribution the basemap licence requires.
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibre.AttributionControl({ compact: true }), 'top-right');
      map.addControl(new maplibre.ScaleControl({ maxWidth: 96, unit: 'metric' }), 'top-left');

      const styleReady = await waitForStyle(map);
      if (disposed || !map) {
        // The page unmounted while a fetch was in flight: tear the map down and
        // leave nothing attached to a container that no longer exists.
        if (disposed) {
          map?.remove();
          map = null;
          mapAliveRef.current = false;
        }
        return;
      }

      let barangayData: FeatureCollection | null = null;
      try {
        const response = await fetch(config.geojsonUrl, { headers: { Accept: 'application/geo+json' } });
        if (!response.ok) {
          fail(
            `The compiled barangay boundaries could not be loaded (HTTP ${response.status} from ${config.geojsonUrl}). Run \`${config.etlHint}\` to rebuild them.`,
          );
          return;
        }
        const parsed: unknown = await response.json();
        if (isFeatureCollection(parsed)) barangayData = parsed;
      } catch (error) {
        fail(
          `The compiled barangay boundaries could not be loaded (${describe(error)}). Run \`${config.etlHint}\` to rebuild them.`,
        );
        return;
      }
      if (disposed || !map) {
        // The page unmounted while a fetch was in flight: tear the map down and
        // leave nothing attached to a container that no longer exists.
        if (disposed) {
          map?.remove();
          map = null;
          mapAliveRef.current = false;
        }
        return;
      }
      if (!barangayData) {
        fail(`The compiled barangay boundaries are not a GeoJSON FeatureCollection. Run \`${config.etlHint}\` to rebuild them.`);
        return;
      }

      // The municipal outline is a nicety; a miss must not break the map.
      let municipalityData: FeatureCollection | null = null;
      try {
        const response = await fetch(config.municipalityUrl, { headers: { Accept: 'application/geo+json' } });
        if (response.ok) {
          const parsed: unknown = await response.json();
          if (isFeatureCollection(parsed)) municipalityData = parsed;
        }
      } catch {
        municipalityData = null;
      }
      if (disposed || !map) {
        // The page unmounted while a fetch was in flight: tear the map down and
        // leave nothing attached to a container that no longer exists.
        if (disposed) {
          map?.remove();
          map = null;
          mapAliveRef.current = false;
        }
        return;
      }

      try {
        addOverlayLayers(map, barangayData, municipalityData);
      } catch (error) {
        fail(`The map layers could not be drawn: ${describe(error)}.`);
        return;
      }

      bindInteractions(map, container, hoveredRef, callbacksRef);
      applyToggles(map, togglesRef.current);

      setPhase('ready');
      setReadyTick((tick) => tick + 1);
      if (styleReady === 'timeout') {
        setNotice(
          'The basemap tiles did not arrive within 20 seconds. Barangay boundaries are drawn from the compiled files and are unaffected.',
        );
      }
      callbacksRef.current.onBasemapState('ready', null);
    };

    void boot();

    return () => {
      disposed = true;
      mapAliveRef.current = false;
      closePopup();
      mapRef.current = null;
      moduleRef.current = null;
      hoveredRef.current = null;
      selectedRef.current = null;
      map?.remove();
      map = null;
    };
    // Deliberately created once: every later change is a prop-driven effect.
    // `bindInteractions` and `fail` only touch refs, and the boot config is
    // frozen in `bootRef`, so the map never needs to be re-created.
  }, [closePopup]);

  /* ─────────────────────── selection → fill state ─────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || readyTick === 0 || !map.isStyleLoaded()) return;

    const previous = selectedRef.current;
    if (previous && previous !== selectedPsgc && map.getSource(SOURCE_IDS.barangays)) {
      map.setFeatureState({ source: SOURCE_IDS.barangays, id: previous }, { selected: false });
    }

    if (!selectedPsgc) {
      selectedRef.current = null;
      closePopup();
      return;
    }

    map.setFeatureState({ source: SOURCE_IDS.barangays, id: selectedPsgc }, { selected: true });
    selectedRef.current = selectedPsgc;
    const barangay = barangayRef.current.get(selectedPsgc);
    if (barangay) openPopup(barangay);
  }, [selectedPsgc, readyTick, closePopup, openPopup]);

  /* ───────────────────────── focus a barangay ───────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || readyTick === 0 || !focus) return;
    const barangay = barangayRef.current.get(focus.psgc);
    if (!barangay) return;

    const duration = prefersReducedMotion() ? 0 : 700;
    const box = barangay.bbox;
    if (box) {
      const canvas = map.getCanvas().getBoundingClientRect();
      const inset = 56;
      const usableWidth = Math.max(180, canvas.width - inset * 2);
      const usableHeight = Math.max(140, canvas.height - inset * 2);
      const lngSpan = Math.max(box[2] - box[0], 0.0008);
      const latSpan = Math.max(box[3] - box[1], 0.0008);
      const fitted = Math.min(
        Math.log2((360 * usableWidth) / (lngSpan * 512)),
        Math.log2((360 * usableHeight) / (latSpan * 512)),
      );
      // Never fly out past the municipality, never closer than the 15 zoom cap.
      const target = Math.min(15, Math.max(map.getMinZoom() + 0.35, fitted));
      map.easeTo({
        center: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2],
        zoom: target,
        duration,
      });
      return;
    }
    if (barangay.centroid) {
      map.easeTo({ center: [barangay.centroid.lng, barangay.centroid.lat], zoom: 14, duration });
    }
  }, [focus, readyTick]);

  /* ───────────────────────── frame the whole municipality ───────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || readyTick === 0 || resetNonce === 0) return;
    const duration = prefersReducedMotion() ? 0 : 600;
    const box = bootRef.current.initialBounds;
    if (box) {
      map.fitBounds(box, { padding: 48, duration });
      return;
    }
    map.easeTo({
      center: [bootRef.current.center.lng, bootRef.current.center.lat],
      zoom: bootRef.current.zoom,
      duration,
    });
  }, [resetNonce, readyTick]);

  /* ────────────────────────── the hazard overlay ────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    const maplibre = moduleRef.current;
    if (!map || !maplibre || readyTick === 0) return;

    let cancelled = false;
    const publish = (runtime: HazardRuntime) => {
      if (!cancelled) callbacksRef.current.onHazardRuntime(runtime);
    };

    const teardown = () => {
      if (!mapAliveRef.current) return;
      for (const id of [LAYER_IDS.hazardOutline, LAYER_IDS.hazardFill]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(SOURCE_IDS.hazard)) map.removeSource(SOURCE_IDS.hazard);
    };

    if (!hazard) {
      publish(IDLE_HAZARD);
      return () => {
        cancelled = true;
        teardown();
      };
    }

    publish({ state: 'loading', message: null, classes: [], featureCount: null });

    const setup = async () => {
      try {
        if (hazard.mode === 'static') {
          if (!hazard.url) throw new Error('the registry names no compiled file for this layer');
          const response = await fetch(hazard.url, { headers: { Accept: 'application/geo+json' } });
          if (!response.ok) {
            throw new Error(`the compiled hazard file answered HTTP ${response.status}`);
          }
          const prepared = prepareHazardGeoJson(await response.json());
          if (!prepared) throw new Error('the compiled hazard file is not a GeoJSON FeatureCollection');
          if (cancelled || !mapRef.current) return;

          const target = mapRef.current;
          target.addSource(SOURCE_IDS.hazard, { type: 'geojson', data: prepared.data });
          target.addLayer(hazardFillLayer(hazardMatchExpression(), 0.55), LAYER_IDS.barangayOutline);
          target.addLayer(hazardOutlineLayer(hazardMatchExpression()), LAYER_IDS.barangayOutline);
          applyToggles(target, togglesRef.current);

          publish({
            state: 'live',
            message:
              prepared.unclassified > 0
                ? `${prepared.unclassified} of ${prepared.featureCount} areas carry a hazard class this reader could not interpret; they are drawn in the neutral tint.`
                : null,
            classes: prepared.classes,
            featureCount: prepared.featureCount,
          });
          return;
        }

        // mode === 'remote' — a PMTiles archive streamed over HTTP range requests.
        registerPmtilesProtocol(maplibre);
        const reader = new PmtilesReader(hazard.url ?? '');
        const header = await reader.header();
        const metadata = await reader.metadata();
        if (cancelled || !mapRef.current) return;

        const vectorLayers = readVectorLayers(metadata);
        const sourceLayer = vectorLayers[0];
        if (!sourceLayer) {
          throw new Error(
            'the archive metadata names no vector layer, so there is nothing to draw from it',
          );
        }
        const field = readHazardField(sourceLayer.fields);
        const paint: unknown = field ? hazardVectorExpression(field) : MAP_COLOURS.hazardUnclassified;

        const target = mapRef.current;
        target.addSource(SOURCE_IDS.hazard, {
          type: 'vector',
          tiles: [`pmtiles://${hazard.url}/{z}/{x}/{y}`],
          minzoom: header.minZoom,
          maxzoom: header.maxZoom,
        });
        // A vector source needs an explicit `source-layer` on every layer fed by it.
        const vectorBinding = { 'source-layer': sourceLayer.id };
        target.addLayer(hazardFillLayer(paint, 0.32, vectorBinding), LAYER_IDS.barangayOutline);
        target.addLayer(hazardOutlineLayer(paint, vectorBinding), LAYER_IDS.barangayOutline);
        applyToggles(target, togglesRef.current);

        const notes = [
          'Streamed live from a remote archive and not clipped to Labo: hazard areas outside the municipality are drawn too.',
        ];
        if (!field) {
          notes.push(
            'The archive does not name a hazard-class field this reader recognises, so every area is drawn in the neutral tint rather than guessed at.',
          );
        }
        publish({ state: 'live', message: notes.join(' '), classes: [], featureCount: null });
      } catch (error) {
        if (cancelled) return;
        teardown();
        publish({ state: 'failed', message: describe(error), classes: [], featureCount: null });
      }
    };

    void setup();

    return () => {
      cancelled = true;
      teardown();
    };
  }, [hazard, readyTick]);

  /* ─────────────────────────── layer visibility ─────────────────────────── */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || readyTick === 0 || !map.isStyleLoaded()) return;
    applyToggles(map, toggles);
  }, [toggles, readyTick]);

  /* ────────────────────────────── rendering ────────────────────────────── */

  return (
    <div className="relative h-full min-h-[24rem] w-full overflow-hidden rounded-card border border-rule bg-surface-sunken">
      <div ref={containerRef} className="absolute inset-0" role="application" aria-label="Interactive barangay map of Labo" />

      {phase === 'loading' ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface-sunken/90 px-6 text-center">
          <div>
            <span
              aria-hidden
              className="mx-auto block size-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-700"
            />
            <p className="mt-3 text-sm font-semibold text-ink">Loading the barangay boundaries…</p>
            <p className="mt-1 text-xs text-ink-support">52 polygons from the compiled PSA/NAMRIA file.</p>
          </div>
        </div>
      ) : null}

      {phase === 'failed' ? (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface px-6 text-center">
          <div className="max-w-md">
            <p className="eyebrow">Map unavailable</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">{notice}</p>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-gray-950 px-3 py-2 text-left text-xs text-gray-100">
              <code>{etlHint}</code>
            </pre>
          </div>
        </div>
      ) : null}

      {phase === 'ready' && notice ? (
        <p
          role="status"
          className="absolute inset-x-3 bottom-3 z-20 rounded-lg border border-accent-orange-200 bg-accent-orange-50 px-3 py-2 text-xs leading-relaxed text-accent-orange-700 sm:inset-x-auto sm:max-w-sm lg:bottom-3"
        >
          {notice}
        </p>
      ) : null}

      <span className="sr-only">
        Hazard overlays are switched on from the layer panel; the panel always names whether an overlay is
        compiled in this build, streamed from a remote archive, or unavailable.
      </span>
    </div>
  );
}

/* ────────────────────────────── map plumbing ────────────────────────────── */

/** The PSGC code under the pointer, or `null` when nothing is drawn there. */
function readPsgcAt(map: MapLibreMap, event: MapMouseEvent): string | null {
  if (!map.getLayer(LAYER_IDS.barangayFill)) return null;
  const feature = map.queryRenderedFeatures(event.point, { layers: [LAYER_IDS.barangayFill] })[0];
  const value = feature?.properties?.['psgc_code'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Wires click and hover to the barangay source.
 *
 * Highlights are carried by `feature-state` rather than a layer filter, so the
 * polygon under the pointer lights up without re-uploading the whole source.
 * Both refs are read at event time, so the handler never goes stale.
 */
function bindInteractions(
  map: MapLibreMap,
  container: HTMLElement,
  hoveredRef: { current: string | null },
  selectRef: { current: { onSelect: (psgc: string | null) => void } },
): void {
  const clearHover = () => {
    if (hoveredRef.current && map.getSource(SOURCE_IDS.barangays)) {
      map.setFeatureState({ source: SOURCE_IDS.barangays, id: hoveredRef.current }, { hover: false });
    }
    hoveredRef.current = null;
  };

  map.on('mousemove', (event) => {
    const psgc = readPsgcAt(map, event);
    container.style.cursor = psgc ? 'pointer' : '';
    if (psgc === hoveredRef.current) return;
    clearHover();
    hoveredRef.current = psgc;
    if (psgc) map.setFeatureState({ source: SOURCE_IDS.barangays, id: psgc }, { hover: true });
  });

  map.on('mouseout', () => {
    container.style.cursor = '';
    clearHover();
  });

  map.on('click', (event) => {
    // Clicking the basemap clears the selection rather than doing nothing.
    selectRef.current.onSelect(readPsgcAt(map, event));
  });
}

function addOverlayLayers(
  map: MapLibreMap,
  barangays: FeatureCollection,
  municipality: FeatureCollection | null,
): void {
  map.addSource(SOURCE_IDS.barangays, { type: 'geojson', data: barangays, promoteId: 'psgc_code' });
  if (municipality) {
    map.addSource(SOURCE_IDS.municipality, { type: 'geojson', data: municipality });
  }

  map.addLayer({
    id: LAYER_IDS.barangayFill,
    type: 'fill',
    source: SOURCE_IDS.barangays,
    paint: {
      'fill-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        MAP_COLOURS.selectedFill,
        ['boolean', ['feature-state', 'hover'], false],
        MAP_COLOURS.hoverFill,
        ['boolean', ['get', 'is_poblacion'], false],
        MAP_COLOURS.poblacionFill,
        MAP_COLOURS.barangayFill,
      ],
      'fill-opacity': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        0.42,
        ['boolean', ['feature-state', 'hover'], false],
        0.34,
        ['boolean', ['get', 'is_poblacion'], false],
        0.28,
        0.18,
      ],
    },
  } satisfies AddLayerObject);

  map.addLayer({
    id: LAYER_IDS.barangayOutline,
    type: 'line',
    source: SOURCE_IDS.barangays,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': [
        'case',
        ['boolean', ['feature-state', 'selected'], false],
        MAP_COLOURS.outlineStrong,
        MAP_COLOURS.outline,
      ],
      'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.6, 1],
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, 0.65],
    },
  } satisfies AddLayerObject);

  map.addLayer({
    id: LAYER_IDS.barangayLabels,
    type: 'symbol',
    source: SOURCE_IDS.barangays,
    minzoom: 11,
    layout: {
      visibility: 'none',
      'text-field': ['get', 'name'],
      'text-font': ['Open Sans Regular', 'Noto Sans Regular'],
      'text-size': 11,
      'text-padding': 6,
      'text-allow-overlap': false,
    },
    paint: {
      'text-color': '#1e2124',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.4,
      'text-halo-blur': 0.4,
    },
  } satisfies AddLayerObject);

  if (municipality) {
    map.addLayer({
      id: LAYER_IDS.municipalityOutline,
      type: 'line',
      source: SOURCE_IDS.municipality,
      layout: { 'line-join': 'round' },
      paint: {
        'line-color': MAP_COLOURS.outlineStrong,
        'line-width': 2.6,
        'line-opacity': 0.72,
      },
    } satisfies AddLayerObject);
  }
}

function hazardFillLayer(
  colour: unknown,
  opacity: number,
  extra: Record<string, unknown> = {},
): AddLayerObject {
  return {
    id: LAYER_IDS.hazardFill,
    type: 'fill',
    source: SOURCE_IDS.hazard,
    ...extra,
    paint: { 'fill-color': colour, 'fill-opacity': opacity },
  } as AddLayerObject;
}

function hazardOutlineLayer(colour: unknown, extra: Record<string, unknown> = {}): AddLayerObject {
  return {
    id: LAYER_IDS.hazardOutline,
    type: 'line',
    source: SOURCE_IDS.hazard,
    ...extra,
    layout: { 'line-join': 'round' },
    paint: { 'line-color': colour, 'line-width': 0.8, 'line-opacity': 0.55 },
  } as AddLayerObject;
}

function applyToggles(map: MapLibreMap, toggles: LayerToggles): void {
  const entries: Array<[readonly string[], boolean]> = [
    [TOGGLE_LAYERS.boundaries, toggles.boundaries],
    [TOGGLE_LAYERS.labels, toggles.labels],
    [TOGGLE_LAYERS.municipality, toggles.municipality],
    [TOGGLE_LAYERS.hazard, toggles.hazard],
  ];
  for (const [ids, visible] of entries) {
    for (const id of ids) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      }
    }
  }
}

/** Resolves once the style is parsed, or after 20s so a stalled tile host cannot block the overlay. */
async function waitForStyle(map: MapLibreMap): Promise<'load' | 'timeout'> {
  if (map.isStyleLoaded()) return 'load';
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (result: 'load' | 'timeout') => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    map.once('load', () => finish('load'));
    window.setTimeout(() => finish('timeout'), 20_000);
  });
}

function readVectorLayers(
  metadata: Record<string, unknown> | null,
): Array<{ id: string; fields: Record<string, string> | null }> {
  const raw = metadata?.['vector_layers'];
  if (!Array.isArray(raw)) return [];
  const layers: Array<{ id: string; fields: Record<string, string> | null }> = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const candidate = entry as { id?: unknown; fields?: unknown };
    if (typeof candidate.id !== 'string' || candidate.id.length === 0) continue;
    const fields =
      typeof candidate.fields === 'object' && candidate.fields !== null
        ? (candidate.fields as Record<string, string>)
        : null;
    layers.push({ id: candidate.id, fields });
  }
  return layers;
}

const HAZARD_FIELD_CANDIDATES = [
  'hazard',
  'hazard_class',
  'hazardClass',
  'class',
  'var',
  'level',
  'susceptibility',
];

function readHazardField(fields: Record<string, string> | null): string | null {
  if (!fields) return null;
  const names = Object.keys(fields);
  for (const candidate of HAZARD_FIELD_CANDIDATES) {
    const match = names.find((name) => name.toLowerCase() === candidate.toLowerCase());
    if (match) return match;
  }
  return null;
}

function isFeatureCollection(value: unknown): value is FeatureCollection {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { type?: unknown; features?: unknown };
  return candidate.type === 'FeatureCollection' && Array.isArray(candidate.features);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
