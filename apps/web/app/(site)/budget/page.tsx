import Link from 'next/link';
import { formatDate, formatNumber } from '@betterlabo/shared';
import type { FiscalSheet } from '@betterlabo/shared';

import { BudgetFilterBar } from '@/components/budget/filter-bar';
import { KeyFigures, LabelCollisions, SupportingFigures } from '@/components/budget/key-figures';
import {
  collisionIndex,
  facetCounts,
  filterSheets,
  groupByWorkbook,
  parseBasis,
  parseFilters,
  resolveFiscalDataset,
  shortWorkbookLabel,
  zeroFigureCount,
} from '@/components/budget/model';
import { BudgetSection } from '@/components/budget/section-card';
import { SectionIndex } from '@/components/budget/section-index';
import { SourcePanel } from '@/components/budget/source-panel';
import { Chip, EmptyState, Eyebrow, SectionHeading } from '@/components/ui/primitives';
import { DATA_FILES, ETL_HINT, getDatasetRegistry, getFiscal, publicDataPath } from '@/lib/data';

export const metadata = {
  title: 'Budget — FY 2024',
  description:
    'Every compiled section of the FY 2024 BLGF local fiscal data for Labo, Camarines Norte — receipts, expenditures, dependency ratios, the Special Education Fund and the disaster risk reduction fund — each row with the workbook, sheet, row and columns it came from.',
};

/** A printed sheet must not hide a section somebody collapsed on screen. */
const PRINT_STYLE = `
@media print {
  details[data-budget-section] > summary { display: block !important; }
  details[data-budget-section]:not([open]) > *:not(summary) { display: block !important; }
  details[data-budget-section]::details-content { content-visibility: visible !important; visibility: visible !important; }
}
`;

const HOW_TO_READ: ReadonlyArray<{ rule: string; detail: string }> = [
  {
    rule: 'An em dash is not a zero',
    detail:
      '“—” means the source left that cell blank. The workbooks never report a blank as 0, and neither does this page. ₱0.00 appears only where BLGF itself prints a zero.',
  },
  {
    rule: 'Totals are the source’s cells, not sums',
    detail:
      '“Total as published” is the cell BLGF printed. Where the rows listed beneath it add up to something else, the page shows both numbers and the difference — in the section, not in a footnote.',
  },
  {
    rule: 'Groups are never summed',
    detail:
      'The workbooks nest sub-totals inside totals, so adding a whole group would count the same peso twice. This page shows every section and no group total.',
  },
  {
    rule: '“~” marks a share this portal computed',
    detail:
      'An unmarked share was compiled from the same row as the figure. A share marked “~” is this portal dividing that row by the rows listed in its section, because the source published none.',
  },
  {
    rule: 'Every section carries its basis',
    detail:
      'Under each heading: the workbook, sheet, row number and column range the section was compiled from, the basis string exactly as recorded, and a link to the published workbook.',
  },
  {
    rule: 'FY 2024 is provisional',
    detail:
      'BLGF marks this fiscal year “Preliminary”. Figures can still be revised by the publisher, and the totals are nominal pesos — not adjusted for inflation.',
  },
];

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [fiscal, registry, params] = await Promise.all([
    getFiscal(),
    getDatasetRegistry(),
    searchParams,
  ]);

  if (!fiscal) {
    return (
      <div className="container-page py-12">
        <SectionHeading
          eyebrow="Full Disclosure Policy"
          title="Local budget explorer"
          description="FY 2024 receipts, expenditures and dependency ratios as published by the Bureau of Local Government Finance — one section per published row of the source workbooks."
        />
        <div className="mt-8">
          <EmptyState
            title="No fiscal snapshot in public/data yet"
            description="The budget explorer reads apps/web/public/data/fiscal.json, which the ETL compiles from four BLGF per-LGU workbooks: the Statement of Receipts and Expenditures, Annual Regular Income and Dependencies, the Special Education Fund, and the Local Disaster Risk Reduction Management Fund."
            command={`${ETL_HINT}   # or: npm run etl fiscal`}
            action={{ href: '/data', label: 'See every dataset this portal is built from' }}
          />
        </div>
      </div>
    );
  }

  const sheets = fiscal.sheets;
  const filters = parseFilters(params ?? {});
  const shownSheets = filterSheets(sheets, filters);
  const groupsAll = groupByWorkbook(sheets);
  const groupsShown = groupByWorkbook(shownSheets);
  const counts = facetCounts(sheets, filters);
  const collisions = collisionIndex(sheets);

  const ordinals = new Map<string, number>(sheets.map((sheet, index) => [sheet.id, index + 1]));
  const byId = new Map<string, FiscalSheet>(sheets.map((sheet) => [sheet.id, sheet]));

  // child section id -> the section whose published total already includes it
  const parentOf = new Map<string, string>();
  for (const sheet of sheets) {
    for (const childId of sheet.subSections ?? []) {
      if (!parentOf.has(childId)) parentOf.set(childId, sheet.id);
    }
  }

  const sourceIds = [...new Set(sheets.map((sheet) => sheet.sourceId))];
  const dataset = resolveFiscalDataset(
    registry?.datasets ?? [],
    sourceIds,
    publicDataPath(DATA_FILES.fiscal),
  );

  const figureCount = sheets.reduce((total, sheet) => total + sheet.figures.length, 0);
  const zeroCount = sheets.reduce((total, sheet) => total + zeroFigureCount(sheet), 0);
  const shownFigureCount = shownSheets.reduce((total, sheet) => total + sheet.figures.length, 0);
  const percentSheets = sheets.filter((sheet) => sheet.unit === '%').length;

  const bookChips = groupsAll.map((group) => ({
    key: group.key,
    label: group.label,
    matched: counts.get(group.key) ?? 0,
    total: group.sheets.length,
  }));

  return (
    <>
      <style precedence="budget-print">{PRINT_STYLE}</style>

      {/* A printed sheet has to describe itself: the masthead never prints. */}
      <p className="container-page hidden pt-6 text-xs text-ink-support print:block">
        BetterLabo — Labo, Camarines Norte. FY {fiscal.fiscalYear} local fiscal data compiled from
        BLGF workbooks (
        {fiscal.preliminary ? 'source status: Preliminary' : 'source status: Final'}), retrieved{' '}
        {dataset ? formatDate(dataset.retrievedAt) : '—'}. {dataset ? dataset.sourceUrl : ''} Licence:{' '}
        {dataset?.license ?? '—'}.
      </p>

      {/* ── Hero + headline figures ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-rule bg-surface">
        <div aria-hidden className="survey-grid absolute inset-0 opacity-60" />
        <div className="container-page relative py-10 lg:py-14">
          <div className="max-w-4xl animate-rise">
            <Eyebrow>Full Disclosure Policy · BLGF FY {fiscal.fiscalYear}</Eyebrow>
            <h1 className="mt-3 text-2xl leading-[1.12] font-extrabold tracking-tight text-ink sm:text-4xl lg:text-5xl">
              Every figure Labo reported for FY {fiscal.fiscalYear},
              <span className="text-brand-900">
                {' '}
                all {sheets.length} published sections, row by row.
              </span>
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-support sm:text-base">
              {fiscal.note}
            </p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Chip
                tone={fiscal.preliminary ? 'warn' : 'good'}
                title="The source workbook marks this fiscal year Preliminary — BLGF can still revise these totals."
              >
                {fiscal.preliminary ? 'Preliminary' : 'Final'} FY {fiscal.fiscalYear}
              </Chip>
              <Chip title={`PSGC ${fiscal.municipalityPsgcCode}`}>{fiscal.municipality}</Chip>
              <Chip>{sheets.length} sections</Chip>
              <Chip>{formatNumber(figureCount)} published rows</Chip>
              <Chip title="Rows the source itself prints as zero, across every section">
                {zeroCount} rows are ₱0.00
              </Chip>
              <Chip>{groupsAll.length} workbooks</Chip>
              <Chip title={`Compiled ${formatDate(fiscal.generatedAt)}`}>
                Compiled {formatDate(fiscal.generatedAt)}
              </Chip>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              {dataset ? (
                <a
                  href={dataset.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center rounded-md bg-brand-900 px-4 py-2.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800"
                >
                  Open the BLGF workbook
                  <span aria-hidden className="ml-1.5">
                    ↗
                  </span>
                </a>
              ) : null}
              <Link
                href="/data"
                className="inline-flex items-center rounded-md border border-rule-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
              >
                Data &amp; sources
              </Link>
              <a
                href="#how-to-read"
                className="inline-flex items-center rounded-md border border-transparent px-4 py-2.5 text-sm font-semibold text-brand-800 underline transition-colors hover:text-brand-900"
              >
                How to read this page
              </a>
            </div>
          </div>

          <KeyFigures sheets={sheets} />

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <SupportingFigures sheets={sheets} />
            <LabelCollisions sheets={sheets} />
          </div>
        </div>
        <div aria-hidden className="hazard-tape h-1.5" />
      </section>

      {/* ── The compiled record ────────────────────────────────────────────── */}
      <section className="container-page py-10 lg:py-14">
        <SectionHeading
          eyebrow="The compiled record"
          title="Every section, grouped by the workbook it came from"
          description={`${sheets.length} sections and ${formatNumber(figureCount)} rows, including ${percentSheets} ratio sections. Search a row label, isolate a workbook, or hide the rows BLGF reports as zero — the filters live in the URL, so a view can be linked, printed or shared.`}
        />

        <div className="mt-6 grid gap-6 lg:grid-cols-[17rem_1fr]">
          <SectionIndex
            groups={groupsShown}
            ordinals={ordinals}
            shown={shownSheets.length}
            total={sheets.length}
          />

          <div className="min-w-0">
            <BudgetFilterBar
              filters={filters}
              books={bookChips}
              shown={shownSheets.length}
              total={sheets.length}
              figures={shownFigureCount}
              preliminary={fiscal.preliminary}
              fiscalYear={fiscal.fiscalYear}
            />

            {shownSheets.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="No section matches those filters"
                  description={`${sheets.length} sections are compiled from the BLGF workbooks, but none match the current search, workbook or unit filter. Clearing the filters restores all of them.`}
                  action={{ href: '/budget', label: 'Clear every filter' }}
                />
              </div>
            ) : (
              <div className="mt-5 space-y-8">
                {groupsShown.map((group) => (
                  <section key={group.key} aria-label={group.label}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h3 className="text-sm font-bold tracking-wide text-ink uppercase">
                        {group.label}
                      </h3>
                      <p className="figure-num text-xs text-ink-subtle">
                        {group.sheets.length} sections · {group.figureCount} rows
                      </p>
                    </div>
                    <p className="mt-1 font-mono text-[0.625rem] break-words text-ink-subtle">
                      {group.full}
                    </p>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-ink-subtle">
                      No group total is printed here: the source nests sub-totals inside totals, so
                      adding these sections would count the same peso twice.
                    </p>

                    <div className="mt-3 space-y-4">
                      {group.sheets.map((sheet) => {
                        const parentId = parentOf.get(sheet.id);
                        const parent = parentId ? (byId.get(parentId) ?? null) : null;
                        const nested: FiscalSheet[] = (sheet.subSections ?? [])
                          .map((childId) => byId.get(childId))
                          .filter((child): child is FiscalSheet => Boolean(child));
                        return (
                          <BudgetSection
                            key={sheet.id}
                            sheet={sheet}
                            ordinal={ordinals.get(sheet.id) ?? 0}
                            of={sheets.length}
                            bookLabel={shortWorkbookLabel(parseBasis(sheet.basis).workbook)}
                            dataset={dataset}
                            parent={parent}
                            nested={nested}
                            hideZeros={filters.hideZeros}
                            collisions={collisions}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <SourcePanel
        snapshot={fiscal}
        dataset={dataset}
        registryGeneratedAt={registry?.generatedAt ?? null}
        sectionCount={sheets.length}
        figureCount={figureCount}
      />

      {/* ── How to read this page ──────────────────────────────────────────── */}
      <section id="how-to-read" className="container-page anchor-offset py-14">
        <SectionHeading
          eyebrow="Reading the figures"
          title="Six rules this page follows everywhere"
          description="These are not caveats bolted on at the end — they are why a section shows a difference instead of a tidy total."
        />
        <ol className="mt-8 grid gap-4 lg:grid-cols-2">
          {HOW_TO_READ.map((item) => (
            <li key={item.rule} className="card p-5">
              <p className="text-sm font-bold text-ink">{item.rule}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-support">{item.detail}</p>
            </li>
          ))}
        </ol>

        <div className="card survey-grid mt-8 p-5 sm:p-6">
          <Eyebrow>Honest limits of this page</Eyebrow>
          <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-ink-support">
            <li>
              The Statement of Receipts and Expenditures workbook is captioned “In Php Million” while
              its cells hold pesos — a ₱446,931,453.96 National Tax Allotment, not ₱446.93 trillion.
              Each section repeats that warning in its own note where the source carried one.
            </li>
            <li>
              Amounts are nominal pesos for FY {fiscal.fiscalYear}. Nothing here is adjusted for
              inflation, and no year-on-year comparison is drawn, because only one fiscal year is
              compiled.
            </li>
            <li>
              These are municipal totals. Allocations per barangay are not part of the BLGF workbooks
              compiled here, so this page shows none.
            </li>
            <li>
              Where the source nests a header level deeper, the section is compiled separately and
              both sections say so — in both directions.
            </li>
          </ul>
        </div>
      </section>
    </>
  );
}
