import { formatPercent, formatPeso } from '@betterlabo/shared';
import type { DatasetProvenance, FiscalSheet } from '@betterlabo/shared';

import { Chip, Money } from '@/components/ui/primitives';

import { FigureTable } from './figure-table';
import {
  anchorOf,
  parseBasis,
  sheetIsAllZero,
  sumListedRows,
  zeroFigureCount,
} from './model';

interface Props {
  sheet: FiscalSheet;
  /** 1-based position in the compiled snapshot — stable whatever the filters are. */
  ordinal: number;
  of: number;
  /** Short workbook label this section was compiled from. */
  bookLabel: string;
  dataset: DatasetProvenance | null;
  /** Section whose published total includes this one, when the source nests it. */
  parent: FiscalSheet | null;
  /** Sections the source nests inside this one's total. */
  nested: FiscalSheet[];
  hideZeros: boolean;
  collisions: Map<string, string[]>;
}

/**
 * One compiled BLGF section: the header (what it is, what the source's total
 * says), the basis (which workbook, sheet, row and columns), the source's own
 * note where it published one, the rows, and the arithmetic that reconciles the
 * rows against the published total.
 *
 * The body is a native `<details>`: it needs no JavaScript, prints, and keeps
 * the page readable on a 360 px screen where 31 long sections would otherwise be
 * one endless scroll.
 */
export function BudgetSection({
  sheet,
  ordinal,
  of,
  bookLabel,
  dataset,
  parent,
  nested,
  hideZeros,
  collisions,
}: Props) {
  const basis = parseBasis(sheet.basis);
  const isRatio = sheet.unit === '%';
  const titleId = `${anchorOf(sheet.id)}-title`;
  const sum = sumListedRows(sheet);
  const allZero = sheetIsAllZero(sheet);
  const zeros = zeroFigureCount(sheet);
  const hasShares = sheet.figures.some((figure) => figure.sharePercent != null);

  const delta = sheet.total != null ? sheet.total - sum.sum : null;
  const showsReconciliation =
    sheet.total != null && sum.counted > 0 && delta != null && Math.abs(delta) >= 0.005;
  const explained =
    delta == null ? null : (nested.find((child) => Math.abs((child.total ?? 0) - delta) < 0.005) ?? null);

  return (
    <details
      open
      data-budget-section
      data-section-id={sheet.id}
      id={anchorOf(sheet.id)}
      aria-labelledby={titleId}
      className="card anchor-offset group/section"
    >
      <summary className="cursor-pointer list-none p-4 focus-visible:outline-none sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="figure-num text-[0.6875rem] font-bold tracking-wider text-ink-subtle uppercase">
                Section {ordinal} of {of}
              </span>
              <span aria-hidden className="text-ink-subtle">
                ·
              </span>
              <span className="text-[0.6875rem] font-semibold tracking-wide text-ink-subtle uppercase">
                {bookLabel}
              </span>
              {isRatio ? <Chip tone="brand">ratio</Chip> : null}
              {parent ? (
                <Chip
                  tone="warn"
                  title={`This section's total sits inside the total of “${parent.title}” in the source. Do not add the two.`}
                >
                  nested in another total
                </Chip>
              ) : null}
              {allZero ? (
                <Chip tone="warn" title="Every row of this section is reported as zero by the source">
                  reported as zero
                </Chip>
              ) : zeros > 0 ? (
                <Chip title={`${zeros} of ${sheet.figures.length} rows are reported as zero by the source`}>
                  {zeros} of {sheet.figures.length} rows are 0
                </Chip>
              ) : null}
            </div>
            <h3 id={titleId} className="mt-1.5 text-base font-bold text-ink sm:text-lg">
              {sheet.title}
            </h3>
          </div>

          <div className="text-right">
            <p className="text-[0.6875rem] font-bold tracking-wider text-ink-subtle uppercase">
              {isRatio ? 'Ratio as published' : 'Total as published'}
            </p>
            <p className="mt-1">
              {isRatio ? (
                <span className="figure-num text-xl font-semibold text-ink sm:text-2xl">
                  {formatPercent(sheet.total, 2)}
                </span>
              ) : (
                <>
                  <Money
                    value={sheet.total}
                    compact
                    className="text-xl font-semibold text-ink sm:hidden"
                  />
                  <Money
                    value={sheet.total}
                    className="hidden text-xl font-semibold text-ink sm:inline"
                  />
                </>
              )}
            </p>
          </div>
        </div>

        <p className="mt-2.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-brand-700">
          <span
            aria-hidden
            className="inline-block transition-transform group-open/section:rotate-180"
          >
            ▾
          </span>
          <span className="group-open/section:hidden">Show the rows</span>
          <span className="hidden group-open/section:inline">Hide the rows</span>
        </p>
      </summary>

      <div className="border-t border-rule px-4 pt-3 pb-4 sm:px-5 sm:pb-5">
        {/* ── Basis: which workbook, sheet, row and columns ── */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[0.6875rem] text-ink-subtle">
          <span className="font-bold tracking-wider uppercase">Basis</span>
          <span className="font-mono text-ink-support">{basis.workbook}</span>
          {basis.sheet ? (
            <>
              <span aria-hidden>·</span>
              <span>sheet “{basis.sheet}”</span>
            </>
          ) : null}
          {basis.row ? (
            <>
              <span aria-hidden>·</span>
              <span>row {basis.row}</span>
            </>
          ) : null}
          {basis.columns ? (
            <>
              <span aria-hidden>·</span>
              <span>columns {basis.columns}</span>
            </>
          ) : null}
        </div>
        <p className="mt-1 font-mono text-[0.6875rem] leading-relaxed break-words text-ink-subtle">
          {basis.raw}
        </p>
        {dataset ? (
          <p className="mt-1.5 text-[0.6875rem] text-ink-subtle">
            <a
              href={dataset.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-brand-700 underline"
            >
              {dataset.title}
            </a>{' '}
            <span aria-hidden>↗</span> · {dataset.publisher} · {dataset.license}
            {dataset.sourceVersion ? ` · ${dataset.sourceVersion}` : ''}
          </p>
        ) : null}

        {/* ── The source's own note about this section, verbatim ── */}
        {sheet.note ? (
          <div className="mt-3 rounded-lg border border-accent-orange-200 bg-accent-orange-50 p-3">
            <p className="text-[0.6875rem] font-bold tracking-wider text-accent-orange-700 uppercase">
              Note published with this section
            </p>
            <p className="mt-1.5 text-xs leading-relaxed break-words text-accent-orange-700">
              {sheet.note}
            </p>
          </div>
        ) : null}

        <div className="mt-3">
          <FigureTable sheet={sheet} hideZeros={hideZeros} collisions={collisions} />
        </div>

        {/* ── Nesting, in both directions ── */}
        {nested.length > 0 ? (
          <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-ink-subtle">
            The source nests{' '}
            {nested.map((child, index) => (
              <span key={child.id}>
                {index > 0 ? ', ' : ''}
                <a href={`#${anchorOf(child.id)}`} className="font-semibold text-brand-700 underline">
                  {child.title}
                </a>
              </span>
            ))}{' '}
            one header level deeper, so it is compiled as{' '}
            {nested.length === 1 ? 'its own section' : 'its own sections'} below.
          </p>
        ) : null}
        {parent ? (
          <p className="mt-2.5 text-[0.6875rem] leading-relaxed text-ink-subtle">
            This section is counted inside the published total of{' '}
            <a href={`#${anchorOf(parent.id)}`} className="font-semibold text-brand-700 underline">
              {parent.title}
            </a>
            . The two figures are not additive.
          </p>
        ) : null}

        {/* ── The arithmetic, out loud ── */}
        {showsReconciliation ? (
          <p className="mt-2.5 rounded-md border border-rule bg-surface-sunken px-3 py-2 text-[0.6875rem] leading-relaxed text-ink-support">
            The {sum.counted} listed row{sum.counted === 1 ? '' : 's'} add up to{' '}
            <span className="figure-num font-semibold text-ink">{formatPeso(sum.sum)}</span>; this
            section's Total reads{' '}
            <span className="figure-num font-semibold text-ink">{formatPeso(sheet.total)}</span>
            {delta != null && delta !== 0 ? (
              <>
                {' '}
                — a difference of{' '}
                <span className="figure-num font-semibold text-ink">{formatPeso(Math.abs(delta))}</span>
                {explained ? (
                  <>
                    , which matches the total of “{explained.title}”, compiled as its own section.
                  </>
                ) : (
                  <>
                    , a gap the source does not close in this section.{' '}
                    {sheet.note
                      ? 'The note above is the source’s own explanation of it.'
                      : 'The rows and the Total are both reproduced exactly as published.'}
                  </>
                )}
              </>
            ) : (
              '.'
            )}
            {sum.missing > 0 ? (
              <>
                {' '}
                {sum.missing} row{sum.missing === 1 ? '' : 's'} carr
                {sum.missing === 1 ? 'ies' : 'y'} no published amount and {sum.missing === 1 ? 'is' : 'are'}{' '}
                excluded from that sum.
              </>
            ) : null}
          </p>
        ) : null}

        {!isRatio ? (
          <p className="mt-2.5 text-[0.625rem] leading-relaxed text-ink-subtle">
            {hasShares
              ? 'Share is each row’s percentage of the rows listed in this section, as compiled — not of the section Total. A share marked “~” was computed by this portal because the source published none.'
              : 'The source published no shares for this section’s rows.'}
          </p>
        ) : (
          <p className="mt-2.5 text-[0.625rem] leading-relaxed text-ink-subtle">
            This is a ratio section: the “Ratio” column is the percentage the source publishes, not a
            peso amount.
          </p>
        )}
      </div>
    </details>
  );
}
