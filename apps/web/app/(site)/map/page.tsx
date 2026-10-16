import Link from 'next/link';

import { LABO, LABO_MAP, formatArea, formatNumber, pluralize } from '@betterlabo/shared';

import { MapExplorer } from '@/components/map/map-explorer';
import { deriveHazardOptions, toMapBarangay } from '@/components/map/map-config';
import { Chip, DefRow, ProvenanceRow, SectionHeading, StatTile } from '@/components/ui/primitives';
import {
  DATA_FILES,
  ETL_HINT,
  getBarangayIndex,
  getDatasetRegistry,
  getHazards,
  getProfile,
  publicDataPath,
} from '@/lib/data';
import { EMERGENCY_NOTICE } from '@/lib/site';

export const metadata = { title: 'Map' };

/**
 * The municipal map.
 *
 * Everything that can be decided without a browser is decided here: the barangay
 * list, the statistics, and — the part that matters — exactly which hazard
 * overlays this build can and cannot draw. The client island receives that as
 * resolved data, so the honest state is in the first byte of HTML rather than
 * appearing after a failed fetch.
 */
export default async function MapPage() {
  const [profile, index, hazards, registry] = await Promise.all([
    getProfile(),
    getBarangayIndex(),
    getHazards(),
    getDatasetRegistry(),
  ]);

  const barangays = (index?.barangays ?? []).map(toMapBarangay);
  const hasRegistry = hazards !== null;
  const hazardOptions = deriveHazardOptions({
    layers: hazards?.layers ?? null,
    pmtilesUrl: process.env.NEXT_PUBLIC_NOAH_PMTILES_URL ?? '',
    pmtilesAttribution: process.env.NEXT_PUBLIC_NOAH_PMTILES_ATTRIBUTION ?? '',
  });

  const readyHazards = hazardOptions.filter((option) => option.ready);
  const hasStaticHazard = readyHazards.some((option) => option.mode === 'static');
  const hazardValue = readyHazards.length === 0 ? 'Absent' : hasStaticHazard ? 'Compiled' : 'Remote';

  const datasets = registry?.datasets ?? [];
  const geometryDataset =
    datasets.find((entry) => entry.outputs.some((output) => output.includes('labo-barangays.geojson'))) ??
    null;
  const hazardDataset = datasets.find((entry) => entry.id === 'noah-hazard-maps') ?? null;

  const areaSqKm = profile?.areaSqKm ?? LABO.areaSqKm;
  const barangayCount = index?.count ?? profile?.barangayCount ?? LABO.barangayCount;
  const poblacionCount = profile?.counts.poblacion ?? null;

  return (
    <div className="container-page py-12">
      <SectionHeading
        eyebrow="Geospatial"
        title="Municipal and hazard map"
        description="All 52 barangays of Labo on a real map, drawn from the compiled PSA/NAMRIA boundary file — with Project NOAH flood, landslide and storm-surge overlays wherever this build actually has them."
        action={
          <Link
            href="/barangays"
            className="inline-flex items-center rounded-md border border-rule px-3 py-2 text-sm font-semibold text-ink-support transition-colors hover:border-brand-300 hover:text-brand-900"
          >
            Browse the directory
          </Link>
        }
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Barangays mapped"
          value={formatNumber(barangayCount)}
          hint={`PSGC ${LABO.psgcCode} · ${LABO.province}`}
        />
        <StatTile
          label="Land area"
          value={formatArea(areaSqKm)}
          hint="NAMRIA polygon area summed over every barangay."
        />
        <StatTile
          label="Poblacion cores"
          value={poblacionCount == null ? '—' : formatNumber(poblacionCount)}
          hint={
            poblacionCount == null
              ? 'No profile compiled, so the count is not asserted.'
              : `Barangays the PSA marks "(Pob.)" — the town centre, of ${formatNumber(barangayCount)}.`
          }
        />
        <StatTile
          label="Hazard overlay"
          value={hazardValue}
          unit={readyHazards.length > 0 ? pluralize(readyHazards.length, 'layer') : undefined}
          tone={readyHazards.length === 0 ? 'warning' : 'default'}
          hint={
            readyHazards.length > 0
              ? hasStaticHazard
                ? 'Clipped hazard files ship with this repository.'
                : 'Only a remote, streamed archive is configured.'
              : hasRegistry
                ? 'hazards.json declares no drawable layer.'
                : 'No hazard registry is compiled, so no overlay can be drawn.'
          }
        />
      </div>

      <MapExplorer
        barangays={barangays}
        barangayCount={barangayCount}
        center={profile?.centroid ?? LABO.fallbackCenter}
        zoom={LABO_MAP.zoom}
        minZoom={LABO_MAP.minZoom}
        maxZoom={LABO_MAP.maxZoom}
        bounds={profile?.bounds ?? null}
        rasterTileUrl={process.env.NEXT_PUBLIC_BASEMAP_TILE_URL || LABO_MAP.rasterTileUrl}
        rasterAttribution={LABO_MAP.rasterAttribution}
        basemapStyleUrl={
          process.env.NEXT_PUBLIC_BASEMAP_STYLE_URL ?? LABO_MAP.basemapStyleUrl
        }
        hazardOptions={hazardOptions}
        hasRegistry={hasRegistry}
        etlHint={ETL_HINT}
      />

      {barangays.length === 0 ? (
        <div className="mt-6 rounded-card border border-accent-orange-200 bg-accent-orange-50 px-4 py-3">
          <p className="text-sm font-semibold text-accent-orange-700">
            The barangay index is missing, so search and the per-barangay figures are unavailable.
          </p>
          <p className="mt-1 text-sm text-accent-orange-700">
            The map still draws the polygons it can fetch from{' '}
            <code className="font-mono text-xs">{publicDataPath(DATA_FILES.barangayGeoJson)}</code>. Run{' '}
            <code className="font-mono text-xs">{ETL_HINT}</code> to rebuild the index.
          </p>
        </div>
      ) : null}

      <div className="mt-14 grid gap-10 lg:grid-cols-2">
        <section aria-labelledby="map-reading-heading">
          <h2 id="map-reading-heading" className="text-lg font-bold text-ink">
            How to read this map
          </h2>
          <dl className="mt-3">
            <DefRow term="What is drawn">
              Every barangay polygon from the compiled file. The five poblacion cores are picked out in yellow,
              and the heavier line is the municipal boundary.
            </DefRow>
            <DefRow term="Barangay boundaries">
              PSA Philippine Standard Geographic Code {LABO.psgcCode} with NAMRIA boundary geometry, clipped to
              Labo by the ETL:{' '}
              <code className="font-mono text-xs">{publicDataPath(DATA_FILES.barangayGeoJson)}</code>.
            </DefRow>
            <DefRow term="Hazard overlays">
              {readyHazards.length > 0
                ? 'Each available overlay is listed in the layer panel and labelled compiled or streamed remotely. Nothing is fetched until it is switched on.'
                : 'None are drawn in this build. The layer panel states whether the registry is missing or simply declares no drawable layer — an absent overlay is never silently shown as "no hazard".'}
            </DefRow>
            <DefRow term="Deliberately absent">
              Barangay population. No verified per-barangay census extract has been wired yet, so the map and
              the detail cards say &ldquo;not reported&rdquo; instead of drawing a number from somewhere else.
            </DefRow>
            <DefRow term="Not an emergency tool">
              <span className="text-accent-red-700">{EMERGENCY_NOTICE}</span>
            </DefRow>
          </dl>
        </section>

        <section aria-labelledby="map-sources-heading">
          <h2 id="map-sources-heading" className="text-lg font-bold text-ink">
            Sources
          </h2>
          <dl className="mt-3">
            <DefRow term="Boundary geometry">
              {geometryDataset
                ? `${geometryDataset.title} — ${geometryDataset.publisher}. ${geometryDataset.license}, release ${geometryDataset.sourceVersion ?? 'unversioned'}, ${formatNumber(geometryDataset.rowCount)} features.`
                : 'The boundary dataset is not in the provenance registry, so its publisher and licence cannot be asserted here.'}
            </DefRow>
            <DefRow term="Hazard layers">
              {hazardDataset
                ? `${hazardDataset.title} — ${hazardDataset.publisher}. ${hazardDataset.license}, release ${hazardDataset.sourceVersion ?? 'unversioned'}.`
                : 'Project NOAH (DOST) hazard maps are the intended source; no NOAH dataset is registered in this build.'}
            </DefRow>
            <DefRow term="Basemap">
              Raster tiles from CARTO, built from OpenStreetMap data. The basemap is decoration: every boundary
              and hazard shape above it is drawn from Labo&apos;s own files.
            </DefRow>
          </dl>

          <div className="mt-4">
            <ProvenanceRow
              items={[
                { label: 'Boundaries', value: `${formatNumber(barangayCount)} polygons`, tone: 'brand' },
                { label: 'Geometry', value: 'PSA PSGC + NAMRIA' },
                {
                  label: 'Hazards',
                  value: readyHazards.length === 0 ? 'not compiled' : `${readyHazards.length} available`,
                  tone: readyHazards.length === 0 ? 'warn' : 'default',
                },
                { label: 'Population', value: 'not reported', tone: 'warn' },
              ]}
            />
          </div>

          {registry ? (
            <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
              Provenance registry compiled {registry.generatedAt}. Every figure on this page traces back to a
              named release in{' '}
              <Link href="/data" className="font-semibold text-brand-700 underline">
                Data &amp; sources
              </Link>
              .
            </p>
          ) : (
            <p className="mt-4 flex flex-wrap items-center gap-2 text-xs leading-relaxed text-ink-subtle">
              <Chip tone="warn">No provenance registry</Chip>
              <span>
                Run <code className="font-mono text-xs">{ETL_HINT}</code> to record where each file came from.
              </span>
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
