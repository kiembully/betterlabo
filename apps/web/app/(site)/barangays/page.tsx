import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import {
  formatArea,
  formatDate,
  formatNumber,
  formatPercent,
  pluralize,
  stripPoblacionSuffix,
} from '@betterlabo/shared';

import { AreaShare } from '@/components/barangays/area-share';
import { BarangayDirectory } from '@/components/barangays/barangay-directory';
import { PopulationNotice } from '@/components/barangays/population-notice';
import { readDirectoryState, toSearchParams } from '@/components/barangays/directory-state';
import {
  Chip,
  EmptyState,
  Eyebrow,
  ProvenanceRow,
  SectionHeading,
  StatTile,
} from '@/components/ui/primitives';
import {
  DATA_FILES,
  ETL_HINT,
  getBarangayIndex,
  getDatasetRegistry,
  getProfile,
  publicDataPath,
} from '@/lib/data';

export const metadata: Metadata = {
  title: 'Barangay directory',
  description:
    'All 52 barangays of Labo, Camarines Norte with their PSA PSGC codes, NAMRIA-derived land areas and positions — searchable, filterable and shareable by URL.',
};

const linkButton =
  'inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300';

export default async function BarangaysPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [index, profile, registry, rawParams] = await Promise.all([
    getBarangayIndex(),
    getProfile(),
    getDatasetRegistry(),
    searchParams,
  ]);

  // Converted once: everything downstream reads a URLSearchParams.
  const params = toSearchParams(rawParams);
  const initialState = readDirectoryState(params);

  const barangays = index?.barangays ?? [];
  const totalAreaSqKm = index?.totalAreaSqKm ?? 0;
  const total = index?.count ?? barangays.length;
  const poblacion =
    profile?.counts?.poblacion ?? barangays.filter((record) => record.isPoblacion).length;
  const inland = profile?.counts?.inland ?? total - poblacion;
  const withPopulation = barangays.filter((record) => record.population != null).length;
  const coverage = index ? index.populationCoverage : null;
  const populationReason =
    profile?.pendingFields?.find((pending) => /population/i.test(pending.field))?.reason ?? null;
  const source =
    registry?.datasets.find((dataset) => dataset.id === 'psgc-barangay-boundaries') ?? null;

  // `largestBarangays` carries names only, so resolve each back to its record.
  const byName = new Map<string, string>();
  for (const record of barangays) {
    byName.set(record.name, record.psgcCode);
    byName.set(stripPoblacionSuffix(record.name), record.psgcCode);
  }

  return (
    <>
      <section className="border-b border-rule bg-surface">
        <div className="container-page py-10 sm:py-12">
          <SectionHeading
            as="h1"
            eyebrow="Directory"
            title="Barangay directory"
            description={
              index
                ? `Every one of the ${formatNumber(total)} barangays of ${index.municipality}, Camarines Norte: PSA PSGC code, NAMRIA-derived land area, the share of the municipality it holds, and where it sits.`
                : 'Every barangay in Labo with its PSGC code, land area and position.'
            }
            action={
              <Link href="/map" className={linkButton}>
                See them on the map
              </Link>
            }
          />

          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Barangays"
              value={index ? formatNumber(index.count) : '—'}
              hint={
                poblacion > 0
                  ? `${formatNumber(poblacion)} in the poblacion core, ${formatNumber(inland)} inland and upland`
                  : undefined
              }
            />
            <StatTile
              label="Land area"
              value={formatNumber(totalAreaSqKm, 2)}
              unit="km²"
              hint="Summed from the NAMRIA-derived barangay polygons"
            />
            <StatTile
              label="Largest barangay"
              value={profile?.largestBarangays?.[0]?.name ?? '—'}
              hint={
                profile?.largestBarangays?.[0]
                  ? `${formatArea(profile.largestBarangays[0].areaSqKm)} of the municipal area`
                  : undefined
              }
            />
            <StatTile
              label="Population coverage"
              value={formatPercent(coverage)}
              hint={`${formatNumber(withPopulation)} of ${formatNumber(total)} barangays carry a census figure`}
              tone="warning"
            />
          </div>
        </div>
      </section>

      <section className="container-page py-10 sm:py-12">
        <SectionHeading
          eyebrow="Search, filter, sort"
          title="Find a barangay"
          description="Type a name or a PSGC code, pick a class, or sort by land area. Every one of those choices is written into the address bar, so any view of this list can be linked, bookmarked or sent to somebody else."
        />

        <div className="mt-6">
          {index ? (
            <Suspense fallback={<div aria-hidden className="card survey-grid h-32" />}>
              <BarangayDirectory
                barangays={barangays}
                municipality={index.municipality}
                totalAreaSqKm={totalAreaSqKm}
                initialState={initialState}
              />
            </Suspense>
          ) : (
            <EmptyState
              title="No barangay index in public/data yet"
              description="The directory reads apps/web/public/data/barangays.json, which the barangays task of the ETL compiles from the PSA/NAMRIA boundary release. Until that file exists there is nothing to search."
              command={`${ETL_HINT}   # or: npm run etl barangays`}
            />
          )}
        </div>
      </section>

      {index ? (
        <section className="container-page pb-12">
          <PopulationNotice
            coveragePercent={coverage}
            withData={withPopulation}
            total={total}
            reason={populationReason}
          />
        </section>
      ) : null}

      {index && (profile?.largestBarangays?.length ?? 0) > 0 ? (
        <section className="container-page pb-12">
          <SectionHeading
            eyebrow="Geography"
            title="The five largest barangays"
            description="Labo's upland barangays around Mt. Labo hold most of its land. The poblacion core and the coastal strip together are a fraction of it."
          />
          <ul className="mt-6 grid gap-3 lg:grid-cols-2">
            {(profile?.largestBarangays ?? []).map((largest) => {
              const psgcCode = byName.get(largest.name);
              return (
                <li
                  key={largest.name}
                  className="card flex flex-wrap items-baseline gap-x-4 gap-y-2 p-4"
                >
                  <div className="min-w-0">
                    {psgcCode ? (
                      <Link
                        href={`/barangays/${psgcCode}`}
                        className="text-sm font-semibold text-ink hover:text-brand-800 hover:underline"
                      >
                        {largest.name}
                      </Link>
                    ) : (
                      <span className="text-sm font-semibold text-ink">{largest.name}</span>
                    )}
                    <p className="figure-num mt-0.5 text-xs text-ink-subtle">
                      {formatArea(largest.areaSqKm)}
                    </p>
                  </div>
                  <AreaShare
                    areaSqKm={largest.areaSqKm}
                    totalAreaSqKm={totalAreaSqKm}
                    className="mt-1 w-full sm:mt-0 sm:ml-auto sm:w-64"
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="border-t border-rule bg-surface">
        <div className="container-page py-12">
          <SectionHeading
            eyebrow="Provenance"
            title="Where this index comes from"
            description={index?.note ?? 'No barangay index has been compiled in this build.'}
            action={
              <Link href="/data" className={linkButton}>
                Full dataset registry
              </Link>
            }
          />

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div>
              <ProvenanceRow
                items={[
                  {
                    label: 'Publisher',
                    value: source?.publisher ?? 'PSA PSGC + NAMRIA boundary layers',
                  },
                  { label: 'Licence', value: source?.license ?? 'MIT', tone: 'brand' },
                  { label: 'Release', value: source?.sourceVersion ?? '—' },
                  { label: 'Rows', value: index ? formatNumber(index.count) : '—' },
                  { label: 'Retrieved', value: formatDate(source?.retrievedAt ?? null) },
                  { label: 'Compiled', value: formatDate(index?.generatedAt ?? null) },
                  {
                    label: 'Checksum',
                    value: source?.sha256 ? `${source.sha256.slice(0, 12)}…` : '—',
                  },
                ]}
              />
              <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-subtle">
                {source?.attributionText ??
                  'Boundary polygons derived from PSA Standard Geographic Code snapshots and NAMRIA administrative-boundary shapefiles.'}
                {source?.notes ? ` ${source.notes}` : ''}
              </p>
            </div>

            <div className="card p-5">
              <Eyebrow>Reuse the geometry</Eyebrow>
              <p className="mt-2 text-sm leading-relaxed text-ink-support">
                The same feature collection this index is built from is published as static GeoJSON —
                simplified at 0.0002°, clipped to Labo’s boundary.
              </p>
              <ul className="mt-4 grid gap-2 text-sm">
                <li>
                  <a
                    href={publicDataPath(DATA_FILES.barangayGeoJson)}
                    className="font-semibold text-brand-700 underline hover:text-brand-900"
                  >
                    {DATA_FILES.barangayGeoJson}
                  </a>
                  <span className="ml-2 text-xs text-ink-subtle">52 barangay polygons</span>
                </li>
                <li>
                  <a
                    href={publicDataPath(DATA_FILES.municipalityGeoJson)}
                    className="font-semibold text-brand-700 underline hover:text-brand-900"
                  >
                    {DATA_FILES.municipalityGeoJson}
                  </a>
                  <span className="ml-2 text-xs text-ink-subtle">the municipal outline</span>
                </li>
                <li>
                  <a
                    href={publicDataPath(DATA_FILES.barangayIndex)}
                    className="font-semibold text-brand-700 underline hover:text-brand-900"
                  >
                    {DATA_FILES.barangayIndex}
                  </a>
                  <span className="ml-2 text-xs text-ink-subtle">this index, as JSON</span>
                </li>
              </ul>
              <p className="mt-4 flex flex-wrap items-center gap-2">
                <Chip tone="good">{index ? pluralize(index.count, 'record') : 'no records'}</Chip>
                <Chip>{profile?.province ?? 'Camarines Norte'}</Chip>
                <Chip>{profile?.region ?? 'Region V'}</Chip>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
