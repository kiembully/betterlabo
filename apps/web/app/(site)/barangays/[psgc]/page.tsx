import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import {
  formatArea,
  formatDate,
  formatNumber,
  formatPercent,
  pluralize,
  slugify,
  stripPoblacionSuffix,
} from '@betterlabo/shared';

import { AreaShare } from '@/components/barangays/area-share';
import { PopulationCell, PopulationNotice } from '@/components/barangays/population-notice';
import {
  Chip,
  DefRow,
  Eyebrow,
  Money,
  ProvenanceRow,
  SectionHeading,
  StatTile,
} from '@/components/ui/primitives';
import {
  DATA_FILES,
  getBarangay,
  getBarangayIndex,
  getDatasetRegistry,
  getProfile,
  getProjects,
  publicDataPath,
} from '@/lib/data';

export async function generateStaticParams() {
  const index = await getBarangayIndex();
  return (index?.barangays ?? []).map((record) => ({ psgc: record.psgcCode }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ psgc: string }>;
}): Promise<Metadata> {
  const { psgc } = await params;
  const record = await getBarangay(psgc);
  if (!record) return { title: 'Barangay not found' };
  const label = stripPoblacionSuffix(record.name);
  return {
    title: label,
    description: `${label} (PSGC ${record.psgcCode}), Labo, Camarines Norte — ${formatArea(
      record.areaSqKm,
    )} of land, its share of the municipality, its position, and which public data is still missing.`,
  };
}

const EARTH_RADIUS_KM = 6371.0088;
const COMPASS = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
] as const;

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two barangay centroids, in kilometres. */
function haversineKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rough compass direction from one centroid to another — a reading aid, not a survey. */
function compass(from: { lat: number; lng: number }, to: { lat: number; lng: number }): string {
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(to.lat));
  const x =
    Math.cos(toRad(from.lat)) * Math.sin(toRad(to.lat)) -
    Math.sin(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.cos(dLng);
  const degrees = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return COMPASS[Math.round(degrees / 45) % 8] ?? 'north';
}

const linkButton =
  'inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300';

export default async function BarangayPage({ params }: { params: Promise<{ psgc: string }> }) {
  const { psgc } = await params;
  const [record, index, profile, registry, compiledProjects] = await Promise.all([
    getBarangay(psgc),
    getBarangayIndex(),
    getProfile(),
    getDatasetRegistry(),
    getProjects(),
  ]);
  if (!record) notFound();

  const label = stripPoblacionSuffix(record.name);
  const barangays = index?.barangays ?? [];
  const totalAreaSqKm = index?.totalAreaSqKm ?? 0;
  const count = index?.count ?? barangays.length;
  const share = totalAreaSqKm > 0 ? (record.areaSqKm / totalAreaSqKm) * 100 : null;

  const ranked = [...barangays].sort((a, b) => b.areaSqKm - a.areaSqKm);
  const rankIndex = ranked.findIndex((candidate) => candidate.psgcCode === record.psgcCode);
  const areaRank = rankIndex >= 0 ? rankIndex + 1 : null;
  const largest = ranked[0] ?? null;
  const smallest = ranked.length > 0 ? ranked[ranked.length - 1] : undefined;

  const centre = profile?.centroid ?? null;
  const fromCentreKm = centre ? haversineKm(centre, record.centroid) : null;

  // A bounding-box test, not a polygon test — labelled as such where it is shown.
  const municipalBounds = profile?.bounds ?? null;
  const withinBounds = municipalBounds
    ? record.bbox[0] >= municipalBounds[0] &&
      record.bbox[1] >= municipalBounds[1] &&
      record.bbox[2] <= municipalBounds[2] &&
      record.bbox[3] <= municipalBounds[3]
    : null;

  const neighbours = barangays
    .filter((candidate) => candidate.psgcCode !== record.psgcCode)
    .map((candidate) => ({
      record: candidate,
      km: haversineKm(record.centroid, candidate.centroid),
      direction: compass(record.centroid, candidate.centroid),
    }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 5);

  const withPopulation = barangays.filter((candidate) => candidate.population != null).length;
  const populationReason =
    profile?.pendingFields?.find((pending) => /population/i.test(pending.field))?.reason ?? null;
  const source =
    registry?.datasets.find((dataset) => dataset.id === 'psgc-barangay-boundaries') ?? null;

  // DPWH rows name a barangay as free text, so match on the name as written.
  const projectSlug = slugify(label);
  const projects = compiledProjects?.projects ?? [];
  const namedProjects = projects.filter((project) => {
    if (!project.barangay) return false;
    const written = slugify(stripPoblacionSuffix(project.barangay));
    return written === projectSlug || slugify(project.barangay) === projectSlug;
  });
  const amounts = namedProjects
    .map((project) => project.amount)
    .filter((amount): amount is number => amount != null);
  const namedProjectsTotal = amounts.length > 0 ? amounts.reduce((sum, a) => sum + a, 0) : null;

  return (
    <>
      <section className="border-b border-rule bg-surface">
        <div className="container-page py-10 sm:py-12">
          <nav aria-label="Breadcrumb" className="text-xs">
            <ol className="flex flex-wrap items-center gap-1.5 text-ink-subtle">
              <li>
                <Link
                  href="/barangays"
                  className="font-semibold text-brand-700 hover:text-brand-900"
                >
                  Barangay directory
                </Link>
              </li>
              <li aria-hidden>/</li>
              <li aria-current="page" className="text-ink-support">
                {label}
              </li>
            </ol>
          </nav>

          <div className="mt-4">
            <SectionHeading
              as="h1"
              eyebrow="Barangay"
              title={label}
              description={`One barangay's record, drawn only from what is compiled: the PSA boundary release, the municipal profile, and the datasets this portal carries. ${formatArea(
                record.areaSqKm,
              )} of land, number ${areaRank ?? '—'} of ${formatNumber(count)} ${pluralize(
                count,
                'barangay',
              )} by area.`}
              action={
                <Link href="/map" className={linkButton}>
                  Open the map
                </Link>
              }
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <Chip tone="brand" title="PSA Philippine Standard Geographic Code">
              PSGC {record.psgcCode}
            </Chip>
            {record.isPoblacion ? (
              <Chip tone="warn" title="Named “(Pob.)” in the PSA release — the town core">
                Poblacion core
              </Chip>
            ) : (
              <Chip title="Everything outside the poblacion core">Rural / upland</Chip>
            )}
            <Chip>{profile?.officialName ?? 'Municipality of Labo'}</Chip>
            <Chip>{profile?.province ?? 'Camarines Norte'}</Chip>
            <Chip>{profile?.region ?? 'Region V (Bicol Region)'}</Chip>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Land area"
              value={formatNumber(record.areaSqKm, 2)}
              unit="km²"
              hint={
                areaRank
                  ? `Rank ${formatNumber(areaRank)} of ${formatNumber(count)} by land area`
                  : 'Not in the compiled index'
              }
            />
            <StatTile
              label="Share of Labo"
              value={share == null ? '—' : formatPercent(share, 2)}
              hint={
                share == null
                  ? 'No municipal total compiled'
                  : `${formatArea(record.areaSqKm)} of Labo's ${formatArea(totalAreaSqKm)}`
              }
              tone="brand"
            />
            <StatTile
              label="Population"
              value={
                record.population == null ? (
                  <span className="text-base sm:text-lg">Not available</span>
                ) : (
                  formatNumber(record.population)
                )
              }
              hint="No barangay-level PSA census extract is wired yet — see below"
              tone="warning"
            />
            <StatTile
              label="From the municipal centroid"
              value={fromCentreKm == null ? '—' : formatNumber(fromCentreKm, 1)}
              unit="km"
              hint={
                fromCentreKm == null || !centre
                  ? 'No compiled centroid to measure from'
                  : `${compass(centre, record.centroid)} of the area-weighted municipal centroid`
              }
            />
          </div>
        </div>
      </section>

      <section className="container-page grid gap-6 py-10 sm:py-12 lg:grid-cols-[1.15fr_1fr]">
        <div className="card p-5 sm:p-6">
          <Eyebrow>The record</Eyebrow>
          <dl className="mt-3">
            <DefRow term="PSA name">
              <span className="font-semibold text-ink">{record.name}</span>
              {record.name === label ? null : (
                <span className="ml-2 text-xs text-ink-subtle">
                  the “(Pob.)” suffix marks the poblacion core; lists here use {label}
                </span>
              )}
            </DefRow>
            <DefRow term="PSGC code">
              <span className="figure-num">{record.psgcCode}</span>
            </DefRow>
            <DefRow term="PSGC id">
              <span className="figure-num">{record.psgcId}</span>
            </DefRow>
            <DefRow term="Class">
              {record.isPoblacion ? 'Poblacion core' : 'Rural / upland'}
              {record.isPoblacion ? null : (
                <span className="ml-2 text-xs text-ink-subtle">
                  no “(Pob.)” suffix in the PSA release
                </span>
              )}
            </DefRow>
            <DefRow term="Land area">
              <span className="figure-num">{formatArea(record.areaSqKm)}</span>
              <span className="ml-2 text-xs text-ink-subtle">
                NAMRIA-derived polygon area, not recomputed
              </span>
            </DefRow>
            <DefRow term="Share of the municipality">
              <span className="figure-num">
                {share == null ? '—' : formatPercent(share, 2)}
              </span>
              {share == null ? null : (
                <span className="ml-2 text-xs text-ink-subtle">
                  of {formatArea(totalAreaSqKm)} across {formatNumber(count)}{' '}
                  {pluralize(count, 'barangay')}
                </span>
              )}
            </DefRow>
            <DefRow term="Rank by land area">
              {areaRank == null ? (
                '—'
              ) : (
                <>
                  <span className="figure-num">{formatNumber(areaRank)}</span>
                  <span className="ml-2 text-xs text-ink-subtle">
                    of {formatNumber(count)}
                    {largest && smallest
                      ? ` · largest ${largest.name} (${formatArea(
                          largest.areaSqKm,
                        )}), smallest ${smallest.name} (${formatArea(smallest.areaSqKm)})`
                      : ''}
                  </span>
                </>
              )}
            </DefRow>
            <DefRow term="Population">
              <PopulationCell record={record} />
            </DefRow>
            <DefRow term="Population source">
              {record.populationSource ?? '—'}
            </DefRow>
            <DefRow term="Population year">{record.populationYear ?? '—'}</DefRow>
            <DefRow term="Boundary geometry">
              {record.hasGeometry ? (
                <>
                  Compiled<span className="ml-2 text-xs text-ink-subtle">polygon in {DATA_FILES.barangayGeoJson}</span>
                </>
              ) : (
                'Not in the boundary file'
              )}
            </DefRow>
          </dl>
        </div>

        <div className="grid content-start gap-6">
          <div className="card p-5 sm:p-6">
            <Eyebrow>Where it is</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              The centroid is the geometric centre of the barangay polygon, not the barangay hall.
            </p>
            <dl className="mt-3">
              <DefRow term="Centroid">
                <span className="figure-num">
                  {record.centroid.lat.toFixed(6)}, {record.centroid.lng.toFixed(6)}
                </span>
                <span className="ml-2 text-xs text-ink-subtle">lat, lng (WGS 84)</span>
              </DefRow>
              <DefRow term="Bounding box">
                <span className="figure-num">
                  {record.bbox[0].toFixed(6)}, {record.bbox[1].toFixed(6)} →{' '}
                  {record.bbox[2].toFixed(6)}, {record.bbox[3].toFixed(6)}
                </span>
                <span className="ml-2 text-xs text-ink-subtle">south-west → north-east</span>
              </DefRow>
              {withinBounds == null ? null : (
                <DefRow term="Within the municipal bounds">
                  {withinBounds ? (
                    <span>
                      Yes
                      <span className="ml-2 text-xs text-ink-subtle">
                        the barangay’s bounding box sits inside Labo’s — a box test, not a polygon
                        test
                      </span>
                    </span>
                  ) : (
                    <span>
                      No
                      <span className="ml-2 text-xs text-ink-subtle">
                        the barangay’s bounding box leaves Labo’s — worth checking against the
                        boundary source
                      </span>
                    </span>
                  )}
                </DefRow>
              )}
            </dl>
            <p className="mt-4 flex flex-wrap items-center gap-2">
              <Link href="/map" className={linkButton}>
                Open the map
              </Link>
              <a
                href={publicDataPath(DATA_FILES.barangayGeoJson)}
                className="text-sm font-semibold text-brand-700 underline hover:text-brand-900"
              >
                Download the boundaries
              </a>
            </p>
          </div>

          <div className="card p-5 sm:p-6">
            <Eyebrow>Nearest barangays</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              Straight-line distance between polygon centroids — the five closest, and which way they
              lie.
            </p>
            <ul className="mt-3 grid gap-2">
              {neighbours.map((neighbour) => (
                <li
                  key={neighbour.record.psgcCode}
                  className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule pb-2 last:border-b-0 last:pb-0"
                >
                  <Link
                    href={`/barangays/${neighbour.record.psgcCode}`}
                    className="text-sm font-semibold text-ink hover:text-brand-800 hover:underline"
                  >
                    {stripPoblacionSuffix(neighbour.record.name)}
                  </Link>
                  <span className="figure-num text-xs text-ink-support">
                    {formatNumber(neighbour.km, 1)} km {neighbour.direction}
                  </span>
                  <span className="figure-num ml-auto text-xs text-ink-subtle">
                    {formatArea(neighbour.record.areaSqKm)}
                  </span>
                </li>
              ))}
              {neighbours.length === 0 ? (
                <li className="text-sm text-ink-subtle">
                  No other barangay is compiled in this index.
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </section>

      <section className="container-page pb-10 sm:pb-12">
        <div className="card p-5 sm:p-6">
          <Eyebrow>Land area in context</Eyebrow>
          <h2 className="mt-2 text-lg font-bold text-ink">
            {label} holds {share == null ? '—' : formatPercent(share, 2)} of Labo
          </h2>
          <div className="mt-4">
            <AreaShare areaSqKm={record.areaSqKm} totalAreaSqKm={totalAreaSqKm} />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            Measured against the {formatArea(totalAreaSqKm)} the compiled barangay polygons add up to
            {largest ? `, of which ${largest.name} alone holds ${formatArea(largest.areaSqKm)}` : ''}
            . The municipal total is the sum of these polygons, not a separately published figure.
          </p>
        </div>
      </section>

      <section className="container-page pb-10 sm:pb-12">
        <PopulationNotice
          coveragePercent={index ? index.populationCoverage : null}
          withData={withPopulation}
          total={count}
          reason={populationReason}
          subject={label}
        />
      </section>

      <section className="container-page pb-10 sm:pb-12">
        <SectionHeading
          eyebrow="Infrastructure"
          title={`Public works recorded for ${label}`}
          description="The DPWH transparency dataset is municipality-level: a row names a locality, an implementing office and a legislative district. A project is attributed to a barangay here only when the source itself names one."
          action={
            <Link href="/projects" className={linkButton}>
              All public works
            </Link>
          }
        />

        <div className="mt-6">
          {compiledProjects === null ? (
            <div className="card p-5 sm:p-6">
              <p className="text-sm leading-relaxed text-ink-support">
                <span className="font-semibold text-ink">projects.json is not in this build.</span>{' '}
                Nothing can be attributed to any barangay until the ETL compiles the DPWH source — so
                this page shows no project rows rather than an empty claim about{' '}
                {label}.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
                The public-works task of the ETL writes{' '}
                <span className="figure-num">apps/web/public/data/projects.json</span>; the public
                works page names the exact command and states why the list is empty.
              </p>
              <Link
                href="/projects"
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline hover:text-brand-900"
              >
                Why the public-works list is empty
              </Link>
            </div>
          ) : namedProjects.length === 0 ? (
            <div className="card p-5 sm:p-6">
              <p className="text-sm leading-relaxed text-ink-support">
                The {pluralize(projects.length, 'row')} compiled for Labo name no project in {label}.
                That is not evidence that no work has happened here: the source records a locality,
                not a barangay, and most rows will never name one.
              </p>
            </div>
          ) : (
            <ul className="grid gap-3">
              <li className="text-xs text-ink-subtle">
                Matched on the barangay name as written in the DPWH rows ·{' '}
                {pluralize(namedProjects.length, 'row')}
                {namedProjectsTotal == null ? '' : ' · '}
                {namedProjectsTotal == null ? null : <Money value={namedProjectsTotal} />} total
              </li>
              {namedProjects.map((project) => (
                <li key={project.id} className="card flex flex-wrap items-baseline gap-x-4 gap-y-2 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{project.description}</p>
                    <p className="mt-0.5 text-xs text-ink-subtle">
                      {[project.category, project.status, project.contractor]
                        .filter((part): part is string => Boolean(part))
                        .join(' · ') || 'No category, status or contractor reported'}
                    </p>
                  </div>
                  <div className="text-right">
                    <Money value={project.amount} />
                    <p className="figure-num text-xs text-ink-subtle">{project.year ?? '—'}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="container-page pb-10 sm:pb-12">
        <div className="card border-brand-200 bg-brand-50 p-5 sm:p-6">
          <Eyebrow>Participation</Eyebrow>
          <h2 className="mt-2 text-lg font-bold text-ink">Something wrong in {label}?</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-support">
            Drainage and flooding, roads, waste collection, water, streetlights, disaster response,
            health and social services all route through the reporting form. It opens with this
            barangay already selected.
          </p>
          <Link
            href={`/report?barangay=${record.psgcCode}`}
            className="mt-4 inline-flex items-center rounded-md bg-brand-900 px-4 py-2.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800"
          >
            Report an issue in {label}
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            This portal is not an emergency channel. In a life-threatening emergency, call 911 or the
            MDRRMO hotline directly.
          </p>
        </div>
      </section>

      <section className="border-t border-rule bg-surface">
        <div className="container-page py-12">
          <SectionHeading
            eyebrow="Provenance"
            title="Where this record comes from"
            description={index?.note ?? 'No barangay index has been compiled in this build.'}
            action={
              <Link href="/data" className={linkButton}>
                Full dataset registry
              </Link>
            }
          />
          <div className="mt-6">
            <ProvenanceRow
              items={[
                {
                  label: 'Publisher',
                  value: source?.publisher ?? 'PSA PSGC + NAMRIA boundary layers',
                },
                { label: 'Licence', value: source?.license ?? 'MIT', tone: 'brand' },
                { label: 'PSGC', value: <span className="figure-num">{record.psgcCode}</span> },
                { label: 'Index compiled', value: formatDate(index?.generatedAt ?? null) },
                { label: 'Source retrieved', value: formatDate(source?.retrievedAt ?? null) },
              ]}
            />
            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-subtle">
              {source?.attributionText ??
                'Boundary polygons derived from PSA Standard Geographic Code snapshots and NAMRIA administrative-boundary shapefiles.'}{' '}
              Areas are the upstream AREA_SQKM values; they are not recomputed from the simplified
              geometry, so a recomputed area will differ slightly.
            </p>
            <p className="mt-4">
              <Link
                href="/barangays"
                className="text-sm font-semibold text-brand-700 underline hover:text-brand-900"
              >
                ← Back to the barangay directory
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
