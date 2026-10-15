import Link from 'next/link';

import { formatBytes, formatDate, formatNumber } from '@betterlabo/shared';

import { Chip, Eyebrow, EmptyState, SectionHeading, StatTile } from '@/components/ui/primitives';
import { ETL_HINT, getDatasetRegistry, getHazards } from '@/lib/data';

export const metadata = {
  title: 'Data & sources',
  description:
    'Every dataset BetterLabo is built from: publisher, licence, retrieval date, row count, checksum, and the exact file it produced.',
};

const OUTPUT_LABELS: Record<string, string> = {
  'apps/web/public/data/barangays.json': 'Barangay directory index',
  'apps/web/public/data/labo-barangays.geojson': 'Barangay boundary polygons',
  'apps/web/public/data/labo-municipality.geojson': 'Municipal outline',
  'apps/web/public/data/fiscal.json': 'Fiscal sections and figures',
  'apps/web/public/data/projects.json': 'Infrastructure projects',
  'apps/web/public/data/hazards.json': 'Hazard layer registry',
  'apps/web/public/data/barangay-exposure.json': 'Per-barangay hazard exposure',
};

function outputLabel(path: string) {
  return OUTPUT_LABELS[path] ?? path.replace(/^apps\/web\/public\//, '/');
}

export default async function DataPage() {
  const [registry, hazards] = await Promise.all([getDatasetRegistry(), getHazards()]);
  const datasets = registry?.datasets ?? [];
  const compiled = datasets.filter((d) => !d.unavailable);
  const deferred = datasets.filter((d) => d.unavailable);
  const pending = registry?.pendingFields ?? [];

  return (
    <div className="container-page py-12">
      <SectionHeading
        eyebrow="Provenance"
        title="Data and sources"
        description="Nothing on this portal is typed by hand. Each dataset below is fetched from the publisher by the ETL in this repository, reduced to the part that concerns Labo, and compiled into a static file the website serves. A refresh replaces the file and records a new retrieval date."
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Declared sources" value={formatNumber(datasets.length)} />
        <StatTile label="Compiled in this build" value={formatNumber(compiled.length)} tone="brand" />
        <StatTile label="Deferred" value={formatNumber(deferred.length)} hint="Named, not yet wired" />
        <StatTile
          label="Last refresh"
          value={registry ? formatDate(registry.generatedAt) : '—'}
        />
      </div>

      <div className="mt-12 grid gap-5">
        {datasets.map((d) => (
          <article key={d.id} id={d.id} className="card overflow-hidden">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule bg-surface-sunken p-5">
              <div className="min-w-0">
                <Eyebrow>{d.publisher}</Eyebrow>
                <h3 className="mt-1.5 text-lg font-bold text-ink">{d.title}</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={d.unavailable ? 'warn' : 'good'}>
                  {d.unavailable ? 'Deferred' : 'Compiled'}
                </Chip>
                <Chip>{d.license}</Chip>
              </div>
            </header>

            <div className="grid gap-6 p-5 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="text-sm leading-relaxed text-ink-support">{d.attributionText}</p>

                {d.notes ? (
                  <p className="mt-3 border-l-2 border-brand-200 pl-3 text-xs leading-relaxed text-ink-subtle">
                    {d.notes}
                  </p>
                ) : null}

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="font-semibold text-ink-subtle uppercase">Retrieved</dt>
                    <dd className="mt-0.5 figure-num">{formatDate(d.retrievedAt)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-subtle uppercase">Source version</dt>
                    <dd className="mt-0.5 figure-num">{d.sourceVersion ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-subtle uppercase">Rows compiled</dt>
                    <dd className="mt-0.5 figure-num">{formatNumber(d.rowCount)}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-subtle uppercase">Downloaded</dt>
                    <dd className="mt-0.5 figure-num">{formatBytes(d.bytes)}</dd>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <dt className="font-semibold text-ink-subtle uppercase">Portal dataset</dt>
                    <dd className="mt-0.5">
                      {d.portalDatasetId != null ? (
                        <span className="figure-num">#{d.portalDatasetId}</span>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">
                  <a
                    href={d.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center rounded-md border border-rule-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-300"
                  >
                    Upstream file
                  </a>
                  <a
                    href={d.portalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center rounded-md border border-rule-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-300"
                  >
                    BetterGov Open Data Portal
                  </a>
                  {d.licenseUrl ? (
                    <a
                      href={d.licenseUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center rounded-md border border-rule-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-brand-300"
                    >
                      Licence text
                    </a>
                  ) : null}
                </div>
              </div>

              <div className="rounded-lg border border-rule bg-surface-sunken p-4">
                <Eyebrow>Produced</Eyebrow>
                <ul className="mt-2 grid gap-1.5 text-xs">
                  {d.outputs.length > 0 ? (
                    d.outputs.map((o) => (
                      <li key={o} className="text-ink-support">
                        {outputLabel(o)}
                      </li>
                    ))
                  ) : (
                    <li className="text-ink-subtle">
                      Nothing — this source was not compiled in the last refresh.
                    </li>
                  )}
                </ul>
                {d.sha256 ? (
                  <p className="mt-3 break-all text-[0.625rem] leading-relaxed text-ink-subtle">
                    <span className="font-semibold uppercase">sha256</span> {d.sha256}
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        ))}

        {datasets.length === 0 ? (
          <EmptyState
            title="No provenance registry yet"
            description="The registry is written by the ETL after it compiles the sources."
            command={`${ETL_HINT}`}
          />
        ) : null}
      </div>

      {hazards ? (
        <section className="mt-12">
          <SectionHeading
            eyebrow="Hazard layers"
            title="What is compiled, and what was checked and found empty"
            description={hazards.note}
          />
          <ul className="mt-6 grid gap-3">
            {hazards.layers.map((l) => (
              <li key={l.id} className="card flex flex-wrap items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{l.label}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-support">{l.note}</p>
                </div>
                <Chip
                  tone={
                    l.mode === 'static'
                      ? 'good'
                      : l.mode === 'none-in-area'
                        ? 'brand'
                        : l.mode === 'remote'
                          ? 'warn'
                          : 'bad'
                  }
                >
                  {l.mode === 'static'
                    ? `${formatNumber(l.featureCount)} features`
                    : l.mode === 'none-in-area'
                      ? 'No Labo coverage'
                      : l.mode === 'remote'
                        ? 'Streamed'
                        : 'Not compiled'}
                </Chip>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-12">
        <SectionHeading
          eyebrow="Named, not yet wired"
          title="Fields this portal refuses to guess"
          description="Each of these is named in the BetterLabo brief. None has a machine-readable upstream source yet, so the portal shows them as pending and links to the source document instead."
        />
        <div className="mt-6 grid gap-3 lg:grid-cols-2">
          {pending.map((p) => (
            <div key={p.field} className="card p-4">
              <p className="text-sm font-semibold text-ink">{p.field}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-support">{p.reason}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 card p-6">
        <Eyebrow>Reuse</Eyebrow>
        <h2 className="mt-2 text-xl font-bold text-ink">Take the data and check our work</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-support">
          The compiled files are plain JSON and GeoJSON under{' '}
          <code className="figure-num text-xs">/data/</code> and can be fetched directly, e.g.{' '}
          <Link href="/data/fiscal.json" className="font-semibold text-brand-700 underline">
            /data/fiscal.json
          </Link>
          . The ETL that produced them is open source, and{' '}
          <code className="figure-num text-xs">npm run etl:verify</code> re-checks every figure
          against the source workbook. If a number here disagrees with the official record, that is
          a bug — please report it.
        </p>
      </section>
    </div>
  );
}
