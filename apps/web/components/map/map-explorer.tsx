'use client';

/**
 * The map page's client island.
 *
 * It owns the shared state — which barangay is selected, which layers are on,
 * which hazard overlay is active — and hands it to three presentational parts:
 * the MapLibre canvas, the search combobox and the layer panel. The server has
 * already resolved the hazard options, so the first paint names exactly what can
 * and cannot be drawn.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { Crosshair } from 'lucide-react';

import { cn } from '@/lib/cn';

import { BarangayMap } from './barangay-map';
import { BarangaySummary } from './barangay-summary';
import { LayerPanel } from './layer-panel';
import { MapLegend } from './map-legend';
import { MapSearch } from './map-search';
import { GLYPHS_URL, paddedBounds } from './map-config';
import type { BasemapState, HazardOption, HazardRuntime, LayerToggles, MapBarangay } from './types';

export interface MapExplorerProps {
  barangays: MapBarangay[];
  barangayCount: number;
  center: { lat: number; lng: number };
  zoom: number;
  minZoom: number;
  maxZoom: number;
  bounds: [number, number, number, number] | null;
  rasterTileUrl: string;
  rasterAttribution: string;
  hazardOptions: HazardOption[];
  hasRegistry: boolean;
  etlHint: string;
}

const IDLE_RUNTIME: HazardRuntime = { state: 'idle', message: null, classes: [], featureCount: null };

export function MapExplorer({
  barangays,
  barangayCount,
  center,
  zoom,
  minZoom,
  maxZoom,
  bounds,
  rasterTileUrl,
  rasterAttribution,
  hazardOptions,
  hasRegistry,
  etlHint,
}: MapExplorerProps) {
  const [selectedPsgc, setSelectedPsgc] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ psgc: string; nonce: number } | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [runtime, setRuntime] = useState<HazardRuntime>(IDLE_RUNTIME);
  const [basemapState, setBasemapState] = useState<BasemapState>('loading');

  const [layers, setLayers] = useState<Omit<LayerToggles, 'hazard'>>({
    boundaries: true,
    municipality: true,
    labels: false,
  });

  /**
   * A compiled, in-repository overlay is safe to draw on first paint — it costs
   * one cached file. A streamed archive is not: it is only opened when somebody
   * deliberately picks it.
   */
  const defaultHazard = useMemo(
    () => hazardOptions.find((option) => option.ready && option.mode === 'static') ?? null,
    [hazardOptions],
  );
  const [activeHazardId, setActiveHazardId] = useState<string | null>(defaultHazard?.id ?? null);

  const nonceRef = useRef(0);
  const activeHazard = useMemo(
    () => hazardOptions.find((option) => option.ready && option.id === activeHazardId) ?? null,
    [hazardOptions, activeHazardId],
  );
  const toggles: LayerToggles = useMemo(
    () => ({ ...layers, hazard: activeHazardId !== null }),
    [layers, activeHazardId],
  );
  const selected = useMemo(
    () => barangays.find((barangay) => barangay.psgcCode === selectedPsgc) ?? null,
    [barangays, selectedPsgc],
  );

  /** A click on a polygon selects it; it must not move the camera out from under the finger. */
  const handleMapSelect = useCallback((psgc: string | null) => {
    setSelectedPsgc(psgc);
  }, []);

  const handleSearchSelect = useCallback((psgc: string) => {
    nonceRef.current += 1;
    setSelectedPsgc(psgc);
    setFocus({ psgc, nonce: nonceRef.current });
  }, []);

  const handleHazardChange = useCallback((id: string | null) => {
    setActiveHazardId(id);
    if (id === null) setRuntime(IDLE_RUNTIME);
  }, []);

  const handleToggle = useCallback((key: keyof LayerToggles, value: boolean) => {
    if (key === 'hazard') return;
    setLayers((current) => ({ ...current, [key]: value }));
  }, []);

  return (
    <section aria-labelledby="map-region-heading" className="mt-8 lg:mt-10">
      <h2 id="map-region-heading" className="sr-only">
        Interactive barangay and hazard map
      </h2>

      <div className="lg:grid lg:grid-cols-[22rem_minmax(0,1fr)] lg:gap-5">
        <div className="relative lg:col-start-2 lg:row-start-1 lg:h-[42rem]">
          <MapSearch
            barangays={barangays}
            totalCount={barangayCount}
            onSelect={handleSearchSelect}
            className="absolute inset-x-3 top-3 z-30 lg:left-3 lg:right-auto lg:w-80"
          />

          <div className="h-[62dvh] min-h-[24rem] lg:h-full">
            <BarangayMap
              center={center}
              zoom={zoom}
              minZoom={minZoom}
              maxZoom={maxZoom}
              initialBounds={bounds}
              maxBounds={paddedBounds(bounds, 0.35)}
              rasterTileUrl={rasterTileUrl}
              rasterAttribution={rasterAttribution}
              glyphsUrl={GLYPHS_URL}
              geojsonUrl="/data/labo-barangays.geojson"
              municipalityUrl="/data/labo-municipality.geojson"
              barangays={barangays}
              hazard={activeHazard}
              toggles={toggles}
              selectedPsgc={selectedPsgc}
              focus={focus}
              resetNonce={resetNonce}
              etlHint={etlHint}
              onSelect={handleMapSelect}
              onBasemapState={setBasemapState}
              onHazardRuntime={setRuntime}
            />
          </div>

          <p aria-live="polite" className="sr-only">
            {selected ? `${selected.name} selected.` : 'No barangay selected.'}
          </p>
        </div>

        <LayerPanel
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          toggles={toggles}
          onToggle={handleToggle}
          hazardOptions={hazardOptions}
          activeHazardId={activeHazardId}
          onHazardChange={handleHazardChange}
          runtime={runtime}
          hasRegistry={hasRegistry}
          etlHint={etlHint}
        >
          <div className="mt-6">
            <p className="eyebrow">Basemap</p>
            <p className="mt-1.5 text-xs leading-relaxed text-ink-support">
              CARTO Voyager raster tiles built from OpenStreetMap data. Every boundary and hazard area on
              top of it comes from Labo&apos;s own compiled files.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setResetNonce((nonce) => nonce + 1)}
                className="inline-flex items-center gap-1.5 rounded-md border border-rule px-2.5 py-1.5 text-xs font-semibold text-ink-support transition-colors hover:border-brand-300 hover:text-brand-900"
              >
                <Crosshair aria-hidden className="size-3.5" />
                Fit Labo to view
              </button>
              <span
                className={cn(
                  'chip',
                  basemapState === 'failed'
                    ? 'border-accent-red-500/40 bg-accent-red-50 text-accent-red-700'
                    : 'border-accent-green-500/40 bg-accent-green-50 text-accent-green-700',
                )}
              >
                {basemapState === 'loading'
                  ? 'Basemap loading'
                  : basemapState === 'failed'
                    ? 'Basemap failed'
                    : 'Basemap drawn'}
              </span>
            </div>
          </div>

          <MapLegend hazard={activeHazard} runtime={runtime} toggles={toggles} />

          {selected ? (
            <BarangaySummary barangay={selected} onClear={() => setSelectedPsgc(null)} />
          ) : (
            <p className="mt-6 text-xs leading-relaxed text-ink-subtle">
              Select a barangay by tapping its polygon or searching above to see its area, PSGC code and
              position.
            </p>
          )}
        </LayerPanel>
      </div>
    </section>
  );
}
