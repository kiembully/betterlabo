import type { Metadata } from 'next';
import Link from 'next/link';

import { formatDate, formatNumber, pluralize } from '@betterlabo/shared';

import {
  Chip,
  DefRow,
  EmptyState,
  Eyebrow,
  Money,
  ProvenanceRow,
  SectionHeading,
  StatTile,
} from '@/components/ui/primitives';
import { ETL_HINT, getDatasetRegistry, getProfile, getProjects } from '@/lib/data';
import type { ProjectRecord } from '@betterlabo/shared';

export const metadata: Metadata = {
  title: 'Public works',
  description:
    'Infrastructure projects the DPWH transparency dataset records against the Municipality of Labo, Camarines Norte — municipality-level rows, with the barangay named only when the source names one.',
};

const linkButton =
  'inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300';

/** Next hands `searchParams` over as a record whose values may be arrays. */
function toParams(input: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.length > 0) params.set(key, first);
  }
  return params;
}

function filterHref(filters: { q?: string; year?: string; status?: string }): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.year) params.set('year', filters.year);
  if (filters.status) params.set('status', filters.status);
  const query = params.toString();
  return query ? `/projects?${query}` : '/projects';
}

const projectMeta = (project: ProjectRecord): string =>
  [project.category, project.status, project.contractor]
    .filter((part): part is string => Boolean(part))
    .join(' · ') || 'No category, status or contractor reported in the source';

function ProjectCard({ project }: { project: ProjectRecord }) {
  return (
    <li className="card flex flex-col gap-3 p-4">
      <p className="text-sm font-semibold text-ink">{project.description}</p>
      <p className="text-xs leading-relaxed text-ink-support">{projectMeta(project)}</p>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <dt className="eyebrow">Amount</dt>
          <dd className="mt-1">
            <Money value={project.amount} />
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Year</dt>
          <dd className="figure-num mt-1 text-sm text-ink">{project.year ?? '—'}</dd>
        </div>
      </dl>
      <p className="flex flex-wrap items-center gap-2">
        <Chip title="The barangay this row names, exactly as the source writes it">
          {project.barangay ?? 'No barangay named'}
        </Chip>
        {project.sourceOfFunds ? <Chip>{project.sourceOfFunds}</Chip> : null}
        <span className="figure-num text-[0.6875rem] text-ink-subtle">{project.id}</span>
      </p>
    </li>
  );
}

function ProjectTableRow({ project }: { project: ProjectRecord }) {
  return (
    <tr className="border-b border-rule align-top last:border-b-0 hover:bg-brand-50">
      <th scope="row" className="py-3 pr-3 text-left font-normal">
        <span className="block max-w-xl text-sm font-semibold text-ink">{project.description}</span>
        <span className="mt-0.5 block text-xs text-ink-subtle">{projectMeta(project)}</span>
      </th>
      <td className="px-3 py-3 text-xs text-ink-support">
        {project.barangay ?? <span className="text-ink-subtle">—</span>}
      </td>
      <td className="px-3 py-3 text-right">
        <Money value={project.amount} />
      </td>
      <td className="figure-num px-3 py-3 text-right text-xs text-ink-support">
        {project.year ?? '—'}
      </td>
      <td className="figure-num hidden px-3 py-3 text-xs text-ink-subtle lg:table-cell">
        {project.id}
      </td>
    </tr>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [compiled, registry, profile, rawParams] = await Promise.all([
    getProjects(),
    getDatasetRegistry(),
    getProfile(),
    searchParams,
  ]);

  const params = toParams(rawParams);
  const q = (params.get('q') ?? '').trim();
  const year = params.get('year');
  const status = params.get('status');

  const projects = compiled?.projects ?? [];
  const source = registry?.datasets.find((dataset) => dataset.id === 'dpwh-infrastructure') ?? null;

  const years = [...new Set(projects.map((project) => project.year))]
    .filter((value): value is number => value != null)
    .sort((a, b) => b - a);
  const statuses = [
    ...new Set(projects.map((project) => project.status).filter((value): value is string => Boolean(value))),
  ].sort((a, b) => a.localeCompare(b, 'en'));
  const namedBarangays = new Set(
    projects.map((project) => project.barangay).filter((value): value is string => Boolean(value)),
  );

  const amounts = projects
    .map((project) => project.amount)
    .filter((amount): amount is number => amount != null);
  const totalAmount = amounts.length > 0 ? amounts.reduce((sum, amount) => sum + amount, 0) : null;
  const largestAmount = amounts.length > 0 ? Math.max(...amounts) : null;

  const needle = q.toLowerCase();
  const filtered = projects.filter((project) => {
    if (year && String(project.year ?? '') !== year) return false;
    if (status && project.status !== status) return false;
    if (!needle) return true;
    return [
      project.description,
      project.category,
      project.contractor,
      project.barangay,
      project.sourceOfFunds,
      project.id,
    ].some((value) => typeof value === 'string' && value.toLowerCase().includes(needle));
  });

  const filteredAmounts = filtered
    .map((project) => project.amount)
    .filter((amount): amount is number => amount != null);
  const filteredTotal =
    filteredAmounts.length > 0 ? filteredAmounts.reduce((sum, amount) => sum + amount, 0) : null;
  const filtering = Boolean(q || year || status);
  const compiledAt = registry?.generatedAt ?? null;

  return (
    <>
      <section className="border-b border-rule bg-surface">
        <div className="container-page py-10 sm:py-12">
          <SectionHeading
            as="h1"
            eyebrow="Infrastructure"
            title="Public works in Labo"
            description="Infrastructure rows the Department of Public Works and Highways records against the Municipality of Labo, compiled by this portal's ETL from the DPWH transparency dataset."
            action={
              <Link href="/data" className={linkButton}>
                Source and licence
              </Link>
            }
          />

          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Rows compiled"
              value={compiled === null ? '—' : formatNumber(projects.length)}
              hint={compiled === null ? 'projects.json is not in this build' : 'One row per project record'}
            />
            <StatTile
              label="Total recorded amount"
              value={totalAmount == null ? '—' : <Money value={totalAmount} compact />}
              hint={
                amounts.length === 0
                  ? 'No amount is reported in the compiled rows'
                  : `${formatNumber(amounts.length)} of ${formatNumber(projects.length)} rows carry an amount`
              }
            />
            <StatTile
              label="Largest single contract"
              value={largestAmount == null ? '—' : <Money value={largestAmount} compact />}
              hint="The highest amount in the compiled rows"
            />
            <StatTile
              label="Barangays named"
              value={compiled === null ? '—' : formatNumber(namedBarangays.size)}
              hint="Rows that name a barangay — the source does this for a minority of projects"
            />
          </div>
        </div>
      </section>

      {/* ── Scope: this is municipality-level data ─────────────────────────── */}
      <section className="container-page py-10 sm:py-12">
        <div className="card p-5 sm:p-6">
          <Eyebrow>Scope · municipality-level</Eyebrow>
          <h2 className="mt-2 text-lg font-bold text-ink">
            These rows are Labo-wide, not a barangay-by-barangay breakdown
          </h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3 text-sm leading-relaxed text-ink-support">
              <p>
                The DPWH transparency dataset records a project against a{' '}
                <span className="font-semibold text-ink">locality</span> — the municipality — plus an
                implementing office and a legislative district. It does not carry a barangay column
                for every project, and it does not carry per-barangay totals at all.
              </p>
              <p>
                A row is attributed to a barangay on this portal only when the source itself names one
                in its <span className="figure-num">barangay</span> field. Nothing is assigned to a
                barangay from a coordinate, from a contractor’s address, or from guesswork.
              </p>
              <p>
                So a barangay with no matching row is <span className="font-semibold text-ink">not</span>{' '}
                a barangay with no public works — it is a barangay the source did not name. The
                per-barangay page says exactly that.
              </p>
            </div>
            <dl className="card bg-surface-sunken p-4">
              <DefRow term="Source">
                {source?.title ?? 'DPWH Infrastructure Transparency Dataset'}
              </DefRow>
              <DefRow term="Publisher">
                {source?.publisher ?? 'Department of Public Works and Highways (DPWH)'}
              </DefRow>
              <DefRow term="Granularity">
                Municipality-level rows
                <span className="ml-2 text-xs text-ink-subtle">
                  one row per project; barangay only when named
                </span>
              </DefRow>
              <DefRow term="Licence">{source?.license ?? 'CC0 1.0 Universal'}</DefRow>
              <DefRow term="Released">
                {source?.sourceVersion ?? '—'}
                <span className="ml-2 text-xs text-ink-subtle">
                  retrieved {formatDate(source?.retrievedAt ?? null)}
                </span>
              </DefRow>
              <DefRow term="Portal">
                {source?.portalUrl ? (
                  <a
                    href={source.portalUrl}
                    rel="noreferrer noopener"
                    target="_blank"
                    className="font-semibold text-brand-700 underline hover:text-brand-900"
                  >
                    data.bettergov.ph dataset {source.portalDatasetId ?? '—'}
                  </a>
                ) : (
                  'data.bettergov.ph'
                )}
              </DefRow>
            </dl>
          </div>
        </div>
      </section>

      {/* ── The list, the filters, or the reason there is nothing here ─────── */}
      <section className="container-page pb-10 sm:pb-12">
        <SectionHeading
          eyebrow="Records"
          title="Compiled project rows"
          description="Search, then narrow by year or status. Every filter is a plain link, so a filtered view works without JavaScript and can be shared as-is."
        />

        <div className="mt-6">
          {compiled === null ? (
            <div className="grid gap-4">
              <EmptyState
                title="projects.json is not in this build"
                description={
                  <>
                    This page reads <span className="figure-num">apps/web/public/data/projects.json</span>,
                    which the projects task of the ETL compiles from the DPWH transparency dataset. That
                    file is absent, so there is nothing to list — the gap is in this portal’s compiled
                    data, not a statement that Labo has no public works.
                  </>
                }
                command={`${ETL_HINT}   # or: npm run etl projects`}
                action={{ href: '/data', label: 'See every dataset and what was compiled' }}
              />

              <div className="card p-5 sm:p-6">
                <Eyebrow>Diagnosis · straight from the dataset registry</Eyebrow>
                <h3 className="mt-2 text-base font-bold text-ink">
                  The registry marks this source as not compiled in the last run
                </h3>
                <dl className="mt-4 max-w-3xl">
                  <DefRow term="Registry status">
                    <Chip tone={source?.unavailable ? 'bad' : 'warn'}>
                      {source?.unavailable ? 'not compiled in this run' : 'compiled'}
                    </Chip>
                  </DefRow>
                  <DefRow term="Registry note">{source?.notes ?? '—'}</DefRow>
                  <DefRow term="Source retrieved">
                    {formatDate(source?.retrievedAt ?? null)}
                  </DefRow>
                  <DefRow term="Rows in source">
                    {source?.rowCount == null ? 'not reported' : formatNumber(source.rowCount)}
                  </DefRow>
                  <DefRow term="Checksum">
                    {source?.sha256 == null ? 'not computed' : source.sha256.slice(0, 16)}
                  </DefRow>
                  <DefRow term="Registry compiled">{formatDate(compiledAt)}</DefRow>
                  <DefRow term="File expected">
                    <span className="figure-num">apps/web/public/data/projects.json</span>
                  </DefRow>
                </dl>
                <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-subtle">
                  Two independent things can leave this list empty: the ETL task has not produced the
                  file, or the upstream dataset could not be fetched. Both are visible above — nothing
                  here is inferred from a silent zero.
                </p>
                <p className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href="/report"
                    className="text-sm font-semibold text-brand-700 underline hover:text-brand-900"
                  >
                    See something that should be on this list? Report it
                  </Link>
                  {source?.sourceUrl ? (
                    <a
                      href={source.sourceUrl}
                      rel="noreferrer noopener"
                      target="_blank"
                      className="text-sm font-semibold text-brand-700 underline hover:text-brand-900"
                    >
                      Open the upstream source
                    </a>
                  ) : null}
                </p>
              </div>
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title="The compiled file carries no rows"
              description="projects.json exists but holds an empty projects array: the ETL ran and the source returned nothing for Labo. That is a fact about the upstream dataset, not about the municipality's programme of works."
              command={`${ETL_HINT}`}
              action={{ href: '/data', label: 'Check the dataset registry' }}
            />
          ) : (
            <div className="grid gap-4">
              <div className="card p-4 sm:p-5">
                <form
                  action="/projects"
                  method="get"
                  className="flex flex-col gap-3 sm:flex-row sm:items-center"
                >
                  {year ? <input type="hidden" name="year" value={year} /> : null}
                  {status ? <input type="hidden" name="status" value={status} /> : null}
                  <div className="flex-1">
                    <label htmlFor="projects-search" className="sr-only">
                      Search projects by description, contractor, barangay or fund
                    </label>
                    <input
                      id="projects-search"
                      name="q"
                      type="search"
                      defaultValue={q}
                      autoComplete="off"
                      placeholder="Road, drainage, contractor, barangay…"
                      className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-md bg-brand-900 px-4 py-2.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800"
                  >
                    Search
                  </button>
                  {filtering ? (
                    <Link href="/projects" className={linkButton}>
                      Clear
                    </Link>
                  ) : null}
                </form>

                {years.length > 0 ? (
                  <div className="mt-4">
                    <p className="eyebrow">Year</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      <li>
                        <Link
                          href={filterHref({ q, status: status ?? undefined })}
                          aria-current={year ? undefined : 'page'}
                          className={year ? linkButton : 'inline-flex items-center rounded-md bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-900'}
                        >
                          All years
                        </Link>
                      </li>
                      {years.map((option) => {
                        const active = year === String(option);
                        return (
                          <li key={option}>
                            <Link
                              href={filterHref({
                                q,
                                year: active ? undefined : String(option),
                                status: status ?? undefined,
                              })}
                              aria-current={active ? 'page' : undefined}
                              className={
                                active
                                  ? 'inline-flex items-center rounded-md bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-900'
                                  : linkButton
                              }
                            >
                              <span className="figure-num">{option}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                {statuses.length > 0 ? (
                  <div className="mt-4">
                    <p className="eyebrow">Status</p>
                    <ul className="mt-2 flex flex-wrap gap-2">
                      <li>
                        <Link
                          href={filterHref({ q, year: year ?? undefined })}
                          aria-current={status ? undefined : 'page'}
                          className={
                            status
                              ? linkButton
                              : 'inline-flex items-center rounded-md bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-900'
                          }
                        >
                          Any status
                        </Link>
                      </li>
                      {statuses.map((option) => {
                        const active = status === option;
                        return (
                          <li key={option}>
                            <Link
                              href={filterHref({
                                q,
                                year: year ?? undefined,
                                status: active ? undefined : option,
                              })}
                              aria-current={active ? 'page' : undefined}
                              className={
                                active
                                  ? 'inline-flex items-center rounded-md bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-900'
                                  : linkButton
                              }
                            >
                              {option}
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ) : null}

                <p
                  role="status"
                  className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle"
                >
                  <span className="font-semibold text-ink-support">
                    {filtered.length === projects.length
                      ? `All ${pluralize(projects.length, 'row')}`
                      : `${filtered.length} of ${projects.length} rows`}
                  </span>
                  {filteredTotal == null ? null : (
                    <>
                      <span aria-hidden>·</span>
                      <Money value={filteredTotal} />{' '}
                      <span>in the rows shown</span>
                    </>
                  )}
                  {filtering ? (
                    <span className="ml-auto">
                      Filtered view — the address bar holds the exact query.
                    </span>
                  ) : null}
                </p>
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  title="No row matches these filters"
                  description={`${projects.length} rows are compiled for Labo, none of them match the current search and filters.`}
                  action={{ href: '/projects', label: 'Clear the filters' }}
                />
              ) : (
                <>
                  <ul className="grid gap-3 sm:hidden">
                    {filtered.map((project) => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </ul>
                  <div className="card hidden overflow-x-auto sm:block">
                    <table className="w-full min-w-[38rem] border-collapse text-left">
                      <caption className="sr-only">
                        Public-works rows recorded for Labo: {filtered.length} of {projects.length}{' '}
                        rows.
                      </caption>
                      <thead>
                        <tr className="border-b border-rule-strong">
                          <th scope="col" className="eyebrow py-3 pl-4">
                            Project
                          </th>
                          <th scope="col" className="eyebrow px-3 py-3">
                            Barangay named
                          </th>
                          <th scope="col" className="eyebrow px-3 py-3 text-right">
                            Amount
                          </th>
                          <th scope="col" className="eyebrow px-3 py-3 text-right">
                            Year
                          </th>
                          <th scope="col" className="eyebrow hidden py-3 pr-4 pl-3 lg:table-cell">
                            Source id
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((project) => (
                          <ProjectTableRow key={project.id} project={project} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-rule bg-surface">
        <div className="container-page py-12">
          <SectionHeading
            eyebrow="Provenance"
            title="Where these rows come from"
            description={
              source?.attributionText ??
              'Infrastructure project data from the official DPWH transparency platform, packaged by BetterGov.ph.'
            }
            action={
              <Link href="/data" className={linkButton}>
                Full dataset registry
              </Link>
            }
          />
          <div className="mt-6">
            <ProvenanceRow
              items={[
                { label: 'Publisher', value: source?.publisher ?? 'DPWH via BetterGov.ph' },
                { label: 'Licence', value: source?.license ?? 'CC0 1.0 Universal', tone: 'brand' },
                { label: 'Release', value: source?.sourceVersion ?? '—' },
                { label: 'Rows', value: source?.rowCount == null ? '—' : formatNumber(source.rowCount) },
                { label: 'Retrieved', value: formatDate(source?.retrievedAt ?? null) },
                { label: 'Registry compiled', value: formatDate(compiledAt) },
                {
                  label: 'Checksum',
                  value: source?.sha256 ? `${source.sha256.slice(0, 12)}…` : 'not computed',
                  tone: source?.sha256 ? 'default' : 'warn',
                },
                {
                  label: 'Compiled file',
                  value: <span className="figure-num">{'public/data/projects.json'}</span>,
                  tone: compiled === null ? 'bad' : 'default',
                },
              ]}
            />
            <p className="mt-4 max-w-3xl text-xs leading-relaxed text-ink-subtle">
              Municipality-level rows, as published: figure totals describe Labo as a whole and cannot
              be read as a barangay’s budget.{' '}
              {profile?.pendingFields?.find((pending) => /investment plan/i.test(pending.field))
                ? profile.pendingFields.find((pending) => /investment plan/i.test(pending.field))
                    ?.reason
                : 'The Annual Investment Plan is published per-LGU as a PDF, not as a structured dataset, so it is linked rather than transcribed.'}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
