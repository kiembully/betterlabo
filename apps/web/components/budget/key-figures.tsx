import { formatNumber, formatPercent } from '@betterlabo/shared';
import type { FiscalSheet } from '@betterlabo/shared';

import { DefRow, Eyebrow, Money, StatTile } from '@/components/ui/primitives';

import {
  anchorOf,
  findFigure,
  findLabelCollisions,
  findSection,
  parseBasis,
  shortWorkbookLabel,
  type FigureHit,
} from './model';

/**
 * Headline tiles.
 *
 * Each tile is found by the label the source prints, and each one names the
 * section it came from — so a reader can walk from the tile to the workbook row
 * instead of trusting a number with no provenance. A tile whose row is not in
 * the compiled file is dropped rather than shown as zero.
 */
interface TileSpec {
  label: string;
  matcher: RegExp;
  unit?: 'PHP' | '%';
  prefer?: 'largest' | 'first';
  hint?: string;
}

const TILES: readonly TileSpec[] = [
  {
    label: 'Current operating income',
    matcher: /^Total Current Operating Income$/,
    hint: 'Receipts, transfers and subsidy the LGU operated on',
  },
  {
    label: 'Current operating expenditure',
    matcher: /^Total Current Operating Expenditures$/,
    prefer: 'largest',
    hint: 'The workbooks publish this label in more than one section',
  },
  {
    label: 'National tax allotment',
    matcher: /^National Tax Allotment \(NTA\)$/,
    hint: 'The LGU’s share of national taxes',
  },
  {
    label: 'Locally sourced revenue',
    matcher: /^Total Locally\s*-\s*Sourced Revenue \(LSR\)$/,
    hint: 'Tax and non-tax revenue raised in the municipality',
  },
  { label: 'Annual regular income', matcher: /^Annual Regular Income \(ARI\)$/ },
  {
    label: 'NTA dependency',
    matcher: /^NTA Dependency$/,
    unit: '%',
    hint: 'Share of annual regular income that is the national allotment',
  },
  {
    label: 'LSR dependency',
    matcher: /^LSR Dependency$/,
    unit: '%',
    hint: 'Share of annual regular income raised locally',
  },
  { label: 'Capital outlay', matcher: /^Total Capital\/\s*Investment Expenditures$/ },
  { label: 'Fund / cash balance, end', matcher: /^Fund\/ Cash Balance, End$/ },
  { label: 'Special Education Fund spend', matcher: /^Total Expenditures$/ },
  { label: 'Disaster fund appropriated', matcher: /^Budget Appropriation$/, prefer: 'largest' },
  { label: 'Loans and borrowings received', matcher: /^Total Receipts From Loans And Borrowings$/ },
];

/** Rows shown as a plain definition list under the tiles. */
const SUPPORTING: readonly { label: string; title: RegExp }[] = [
  { label: 'Special Education Fund — income', title: /^Income$/ },
  { label: 'Special Education Fund — expenditures', title: /^Expenditures$/ },
  { label: 'Disaster fund — 70% share', title: /^70%/ },
  { label: 'Disaster fund — 30% quick response', title: /^30%/ },
  { label: 'Disaster fund — total', title: /LDRRMF\s*—\s*Total/i },
  { label: 'Receipts from loans and borrowings', title: /^Receipts From Loans And Borrowings$/ },
  { label: 'Non-income receipts', title: /^Non-Income Receipts$/ },
  { label: 'Debt service (principal cost)', title: /Principal Cost/i },
  { label: 'Capital / investment receipts', title: /Capital\/ Investment Receipts/i },
  { label: 'Non-operating expenditures', title: /^Non-Operating Expenditures$/ },
];

/** A section total rendered as pesos or as a ratio, whichever the section is. */
function SectionValue({ sheet }: { sheet: FiscalSheet }) {
  if (sheet.unit === '%') {
    return <span className="figure-num">{formatPercent(sheet.total, 2)}</span>;
  }
  return <Money value={sheet.total} />;
}

function SectionLink({ sheet, children }: { sheet: FiscalSheet; children: React.ReactNode }) {
  return (
    <a
      href={`#${anchorOf(sheet.id)}`}
      aria-label={`Open the section “${sheet.title}”`}
      className="font-semibold text-brand-700 underline"
    >
      {children}
    </a>
  );
}

export function KeyFigures({ sheets }: { sheets: FiscalSheet[] }) {
  const tiles: Array<{ spec: TileSpec; hit: FigureHit }> = [];
  for (const spec of TILES) {
    const hit = findFigure(sheets, spec.matcher, { unit: spec.unit, prefer: spec.prefer });
    if (hit) tiles.push({ spec, hit });
  }
  if (tiles.length === 0) return null;

  return (
    <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {tiles.map(({ spec, hit }) => (
        <li key={spec.label}>
          <StatTile
            label={spec.label}
            tone={spec.unit === '%' ? 'brand' : 'default'}
            value={
              spec.unit === '%' ? (
                formatPercent(hit.figure.amount, 2)
              ) : (
                <Money value={hit.figure.amount} compact />
              )
            }
            hint={
              <>
                {spec.hint ? `${spec.hint} · ` : ''}
                <a href={`#${anchorOf(hit.sheet.id)}`} className="underline">
                  {hit.sheet.title}
                </a>
              </>
            }
          />
        </li>
      ))}
    </ul>
  );
}

export function SupportingFigures({ sheets }: { sheets: FiscalSheet[] }) {
  const rows: Array<{ label: string; sheet: FiscalSheet }> = [];
  for (const spec of SUPPORTING) {
    const sheet = findSection(sheets, spec.title);
    if (sheet) rows.push({ label: spec.label, sheet });
  }
  if (rows.length === 0) return null;

  return (
    <div className="card mt-4 p-5">
      <Eyebrow>Also compiled, in full</Eyebrow>
      <dl className="mt-2">
        {rows.map(({ label, sheet }) => (
          <DefRow key={label} term={label}>
            <SectionValue sheet={sheet} />
            <span className="ml-2 text-xs text-ink-subtle">
              <SectionLink sheet={sheet}>open ↗</SectionLink>
            </span>
          </DefRow>
        ))}
      </dl>
      <p className="mt-3 text-[0.625rem] leading-relaxed text-ink-subtle">
        Each row is that section’s own published total — the sections are listed in full, with their
        basis, further down this page.
      </p>
    </div>
  );
}

/**
 * The same row label published with different amounts in more than one section.
 * A reader who sums "Total Current Operating Expenditures" across the page by
 * hand gets a wrong answer; this panel is why they will not.
 */
export function LabelCollisions({ sheets }: { sheets: FiscalSheet[] }) {
  const collisions = findLabelCollisions(sheets);
  if (collisions.length === 0) return null;
  const shown = collisions.slice(0, 8);

  return (
    <div className="card mt-4 p-5">
      <Eyebrow>Read before adding anything up</Eyebrow>
      <h3 className="mt-2 text-base font-bold text-ink">
        {collisions.length} row label{collisions.length === 1 ? '' : 's'} appear
        {collisions.length === 1 ? 's' : ''} in more than one section
      </h3>
      <p className="mt-2 text-xs leading-relaxed text-ink-support">
        The workbooks repeat labels across sheets — and, for fund flows, across rows of the same
        sheet. Where the amounts differ they are different figures that happen to share a name, so
        rows sitting in different sections must never be added together. Where they match, the same
        figure is published in more than one workbook.
      </p>
      <ul className="mt-3 grid gap-2">
        {shown.map((collision) => {
          const amounts = collision.sections.map((section) => section.amount);
          const firstAmount = amounts[0];
          const allEqual =
            amounts.length > 1 && amounts.every((amount) => amount != null && amount === firstAmount);
          const sorted = [...amounts].filter((amount): amount is number => amount != null).sort((a, b) => b - a);
          const largest = sorted[0];
          const rest = sorted.slice(1);
          const largestIsSum =
            !allEqual &&
            largest != null &&
            rest.length > 1 &&
            Math.abs(largest - rest.reduce((total, amount) => total + amount, 0)) < 0.01;
          const tag = allEqual
            ? 'identical in every section'
            : largestIsSum
              ? 'the largest is the sum of the others'
              : 'different amounts under one label';
          return (
            <li
              key={collision.label}
              className="border-t border-rule pt-2 text-xs leading-relaxed text-ink-support"
            >
              <span className="font-semibold text-ink">{collision.label}</span>
              <span className="text-ink-subtle"> · {collision.sections.length} sections · </span>
              <span
                className={
                  allEqual ? 'font-semibold text-ink-subtle' : 'font-semibold text-accent-orange-700'
                }
              >
                {tag}
              </span>
              <span className="mt-1 block">
                {collision.sections.map((section) => {
                  const sheet = sheets.find((candidate) => candidate.id === section.id);
                  if (!sheet) return null;
                  return (
                    <span key={section.id} className="mr-3 inline-block whitespace-nowrap">
                      <a
                        href={`#${anchorOf(section.id)}`}
                        className="font-semibold text-brand-700 underline"
                        title={`${section.title} — ${sheet.basis}`}
                      >
                        {section.title}
                      </a>{' '}
                      <span className="figure-num text-ink-subtle">
                        {formatNumber(section.amount, 0)}
                      </span>
                      {sheet.unit === '%' ? <span className="text-ink-subtle">%</span> : null}
                      <span className="ml-1 text-[0.625rem] text-ink-subtle">
                        {shortWorkbookLabel(parseBasis(sheet.basis).workbook)}
                      </span>
                    </span>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
      {collisions.length > shown.length ? (
        <p className="mt-2 text-[0.625rem] text-ink-subtle">
          And {collisions.length - shown.length} more: {' '}
          {collisions
            .slice(shown.length)
            .map((collision) => collision.label)
            .join(' · ')}
        </p>
      ) : null}
    </div>
  );
}
