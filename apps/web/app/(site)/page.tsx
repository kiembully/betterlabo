import Link from 'next/link';

import { formatArea, formatDate, formatNumber, formatPercent } from '@betterlabo/shared';

import {
  Chip,
  DefRow,
  EmptyState,
  Eyebrow,
  Money,
  SectionHeading,
  StatTile,
} from '@/components/ui/primitives';
import { ETL_HINT, getBarangayIndex, getDatasetRegistry, getFiscal, getProfile } from '@/lib/data';
import { EMERGENCY_NOTICE, INDEPENDENCE_NOTICE } from '@/lib/site';

export const metadata = {
  title: 'Overview',
  description:
    'Labo, Camarines Norte in one page: 52 barangays, FY 2024 local fiscal data from BLGF, NOAH hazard layers, and a citizen reporting channel.',
};

const MODULES = [
  {
    href: '/map',
    title: 'Interactive map',
    body: 'All 52 barangay boundaries from the PSA/NAMRIA release, with flood and landslide hazard overlays from Project NOAH where the layer is compiled.',
    tag: 'Geospatial',
  },
  {
    href: '/budget',
    title: 'Local budget explorer',
    body: 'FY 2024 receipts and expenditures, annual regular income, NTA dependency, the Special Education Fund and the disaster risk reduction fund — one row per section of the BLGF workbooks.',
    tag: 'Fiscal',
  },
  {
    href: '/barangays',
    title: 'Barangay directory',
    body: 'Searchable index of every barangay with its PSGC code, land area and position, plus a per-barangay page that cross-references the fiscal and hazard data.',
    tag: 'Directory',
  },
  {
    href: '/report',
    title: 'Report an issue',
    body: 'Send a drainage, road, waste or disaster-response concern to the office that handles it, get a reference code, and follow its status.',
    tag: 'Participation',
  },
  {
    href: '/data',
    title: 'Data and sources',
    body: 'Every dataset this portal is built from: publisher, licence, retrieval date, row count, checksum and the exact file it produced.',
    tag: 'Provenance',
  },
] as const;

export default async function HomePage() {
  const [profile, index, fiscal, registry] = await Promise.all([
    getProfile(),
    getBarangayIndex(),
    getFiscal(),
    getDatasetRegistry(),
  ]);

  const ntaDependency = fiscal?.sheets.find((s) => /nta-dependency/i.test(s.id));
  const annualIncome = fiscal?.sheets.find((s) => /annual-regular-income/i.test(s.id));
  const nta = fiscal?.sheets.find((s) => /national-tax-allotment/i.test(s.id));
  const receipts = fiscal?.sheets.find((s) => /^sre-current-operating-income$/i.test(s.id));

  const poblacion = profile?.counts?.poblacion ?? null;
  const datasets = registry?.datasets ?? [];
  const live = datasets.filter((d) => !d.unavailable);
  const missing = datasets.filter((d) => d.unavailable);

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-rule bg-surface">
        <div aria-hidden className="survey-grid absolute inset-0 opacity-60" />
        <div className="container-page relative py-14 lg:py-20">
          <div className="max-w-4xl animate-rise">
            <Eyebrow>BetterGov.ph · BetterLGU community portal</Eyebrow>
            <h1 className="mt-3 text-3xl font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Labo, Camarines Norte —
              <span className="text-brand-900"> all 52 barangays on the public record.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-support sm:text-lg">
              Local fiscal figures as published by the Bureau of Local Government Finance,
              barangay boundaries from the PSA and NAMRIA, flood and landslide hazard
              layers from Project NOAH, and a channel for residents to report what needs
              fixing.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/map"
                className="inline-flex items-center rounded-md bg-brand-900 px-4 py-2.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800"
              >
                Open the map
              </Link>
              <Link
                href="/budget"
                className="inline-flex items-center rounded-md border border-rule-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
              >
                See where the money goes
              </Link>
              <Link
                href="/report"
                className="inline-flex items-center rounded-md border border-transparent px-4 py-2.5 text-sm font-semibold text-brand-800 underline transition-colors hover:text-brand-900"
              >
                Report an issue
              </Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Barangays"
              value={profile ? formatNumber(profile.barangayCount) : '—'}
              hint={poblacion ? `${poblacion} in the poblacion core` : undefined}
            />
            <StatTile
              label="Land area"
              value={profile?.areaSqKm ? formatArea(profile.areaSqKm).replace(' km²', '') : '—'}
              unit="km²"
              hint="NAMRIA-derived, from the boundary dataset"
            />
            <StatTile
              label="Receipts FY 2024"
              value={nta ? formatNumber((nta.total ?? 0) / 1_000_000, 1) : '—'}
              unit="₱ M NTA"
              hint="National Tax Allotment as published by BLGF"
              tone="brand"
            />
            <StatTile
              label="NTA dependency"
              value={ntaDependency ? formatPercent(ntaDependency.total) : '—'}
              hint="Share of annual regular income from the national government"
              tone={ntaDependency && (ntaDependency.total ?? 0) > 80 ? 'warning' : 'default'}
            />
          </div>
        </div>
        <div aria-hidden className="hazard-tape h-1.5" />
      </section>

      {/* ── Modules ──────────────────────────────────────────────────────── */}
      <section className="container-page py-14">
        <SectionHeading
          eyebrow="What this portal does"
          title="Five public surfaces, one provenance trail"
          description="Each module reads cached static JSON compiled at build time by the ETL in this repository. No page scrapes a government website while you are on it."
        />
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((mod) => (
            <li key={mod.href}>
              <Link href={mod.href} className="card card-hover flex h-full flex-col gap-3 p-5">
                <Chip tone="brand">{mod.tag}</Chip>
                <h3 className="text-lg font-bold text-ink">{mod.title}</h3>
                <p className="text-sm leading-relaxed text-ink-support">{mod.body}</p>
                <span className="mt-auto pt-1 text-sm font-semibold text-brand-700">
                  Open <span aria-hidden>→</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Fiscal snapshot ──────────────────────────────────────────────── */}
      <section className="container-page pb-14">
        <SectionHeading
          eyebrow="Money"
          title={fiscal ? `FY ${fiscal.fiscalYear} at a glance` : 'Fiscal data not compiled yet'}
          description={
            fiscal?.note ??
            'Run the fiscal task of the ETL to compile the BLGF workbooks into this portal.'
          }
          action={
            <Link
              href="/budget"
              className="inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
            >
              Full budget explorer
            </Link>
          }
        />
        {fiscal ? (
          <div className="mt-8 grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <Eyebrow>Where the money comes from</Eyebrow>
              <dl className="mt-3">
                <DefRow term="Annual regular income">
                  <Money value={annualIncome?.total ?? null} />
                  {annualIncome?.figures[0]?.note ? (
                    <span className="ml-2 text-xs text-ink-subtle">
                      ({annualIncome.figures[0].note.replace('Source definition: ', '')})
                    </span>
                  ) : null}
                </DefRow>
                <DefRow term="National Tax Allotment">
                  <Money value={nta?.total ?? null} />
                </DefRow>
                <DefRow term="Locally sourced revenue">
                  <Money
                    value={fiscal.sheets.find((s) => /total-locally-sourced/i.test(s.id))?.total ?? null}
                  />
                  <span className="ml-2 text-xs text-ink-subtle">
                    IRS dependency {formatPercent(
                      fiscal.sheets.find((s) => /lsr-dependency/i.test(s.id))?.total ?? null,
                    )}
                  </span>
                </DefRow>
                <DefRow term="Total current operating income">
                  <Money value={receipts?.total ?? null} />
                </DefRow>
              </dl>
            </div>
            <div className="card p-5">
              <Eyebrow>Where the money goes</Eyebrow>
              <dl className="mt-3">
                <DefRow term="Current operating expenditures">
                  <Money
                    value={
                      fiscal.sheets.find((s) => /^sre-by-lgu-sre-fy2024$/i.test(s.id))?.total ?? null
                    }
                  />
                </DefRow>
                <DefRow term="Capital outlay">
                  <Money
                    value={
                      fiscal.sheets.find((s) => /capital-investment-expenditures/i.test(s.id))
                        ?.total ?? null
                    }
                  />
                </DefRow>
                <DefRow term="Special Education Fund spend">
                  <Money
                    value={fiscal.sheets.find((s) => /^sef-expenditures$/i.test(s.id))?.total ?? null}
                  />
                </DefRow>
                <DefRow term="Disaster risk reduction fund">
                  <Money
                    value={fiscal.sheets.find((s) => /^ldrrmf-total$/i.test(s.id))?.total ?? null}
                  />
                </DefRow>
              </dl>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="No fiscal file in public/data yet"
              description="The budget explorer reads apps/web/public/data/fiscal.json, which the ETL compiles from four BLGF per-LGU workbooks."
              command={`${ETL_HINT}   # or: npm run etl fiscal`}
            />
          </div>
        )}
      </section>

      {/* ── Barangays ────────────────────────────────────────────────────── */}
      <section className="container-page pb-14">
        <SectionHeading
          eyebrow="Geography"
          title={index ? `${index.count} barangays mapped` : 'Barangay boundaries not compiled yet'}
          description={
            profile
              ? `Labo spans ${formatArea(profile.areaSqKm)} across ${profile.counts?.poblacion ?? 0} poblacion barangays and ${profile.counts?.inland ?? 0} rural and upland barangays, with ${profile.largestBarangays?.length ?? 0} accounting for most of the upland watershed around Mt. Labo.`
              : 'Run the barangays task of the ETL to compile the PSA/NAMRIA boundary release for Labo.'
          }
          action={
            <Link
              href="/barangays"
              className="inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
            >
              Barangay directory
            </Link>
          }
        />
        {index ? (
          <ul className="mt-8 flex flex-wrap gap-2">
            {index.barangays.slice(0, 18).map((b) => (
              <li key={b.psgcCode}>
                <Link href={`/barangays/${b.psgcCode}`}>
                  <Chip tone={b.isPoblacion ? 'brand' : 'default'} title={
                    `PSGC ${b.psgcCode} · ${formatArea(b.areaSqKm)}`
                  }>
                    {b.name}
                  </Chip>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/barangays">
                <Chip>+ {(index.count ?? 0) - 18} more</Chip>
              </Link>
            </li>
          </ul>
        ) : (
          <div className="mt-8">
            <EmptyState
              title="No barangay file in public/data yet"
              description="The directory and the map both read apps/web/public/data/barangays.json and labo-barangays.geojson."
              command={`${ETL_HINT}   # or: npm run etl barangays`}
            />
          </div>
        )}
      </section>

      {/* ── Provenance ───────────────────────────────────────────────────── */}
      <section className="border-y border-rule bg-surface">
        <div className="container-page py-12">
          <SectionHeading
            eyebrow="Provenance"
            title="Where every number came from"
            description={`${live.length} of ${datasets.length} declared sources were compiled in the last refresh. Nothing on this portal is typed by hand.`}
            action={
              <Link
                href="/data"
                className="inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
              >
                Full registry
              </Link>
            }
          />
          <ul className="mt-8 grid gap-3 lg:grid-cols-2">
            {datasets.slice(0, 6).map((d) => (
              <li key={d.id} className="card flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{d.title}</p>
                  <p className="mt-0.5 text-xs text-ink-subtle">{d.publisher}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>{d.license}</Chip>
                  <Chip tone={d.unavailable ? 'warn' : 'good'}>
                    {d.unavailable
                      ? 'not in this build'
                      : d.rowCount != null
                        ? `${formatNumber(d.rowCount)} rows`
                        : 'compiled'}
                  </Chip>
                </div>
              </li>
            ))}
          </ul>
          {missing.length > 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-ink-subtle">
              Not compiled in this build: {missing.map((d) => d.title).join(', ')}. The public
              pages that depend on them say so instead of showing a blank.
            </p>
          ) : null}
        </div>
      </section>

      {/* ── Honesty ──────────────────────────────────────────────────────── */}
      <section className="container-page py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <Eyebrow>What this portal does not know yet</Eyebrow>
            <h2 className="mt-2 text-2xl font-bold text-ink">
              Missing data is published as missing
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-support">
              A transparency portal that guesses is worse than one that says nothing. These
              fields are named in the project brief but have no machine-readable source wired
              up, so they are shown as pending rather than filled in:
            </p>
            <ul className="mt-5 grid gap-3">
              {(profile?.pendingFields ?? []).slice(0, 4).map((p) => (
                <li key={p.field} className="card p-4">
                  <p className="text-sm font-semibold text-ink">{p.field}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-support">{p.reason}</p>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Eyebrow>Independence and safety</Eyebrow>
            <div className="card mt-2 space-y-4 p-5">
              <p className="text-sm leading-relaxed text-ink-support">{INDEPENDENCE_NOTICE}</p>
              <p className="rounded-lg border border-accent-orange-200 bg-accent-orange-50 p-3 text-sm leading-relaxed text-accent-orange-700">
                {EMERGENCY_NOTICE}
              </p>
              <p className="text-xs leading-relaxed text-ink-subtle">
                Compiled {registry ? formatDate(registry.generatedAt) : '—'}.
                {datasets[0]?.retrievedAt
                  ? ` Most recent source retrieval ${formatDate(datasets[0].retrievedAt)}.`
                  : ''}
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
