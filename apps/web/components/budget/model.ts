/**
 * Pure view-model for the budget explorer.
 *
 * No React and no `@/lib/data` (which is `server-only`): the same functions run
 * in the server page, in the client filter bar and under `tsc`. Filter state
 * lives in the URL, so this module is the only place that knows how to read and
 * write it — the server page renders exactly what the URL says, which is also
 * what a reader gets when they print or share the link.
 */
import { slugify } from '@betterlabo/shared';
import type { DatasetProvenance, FiscalFigure, FiscalSheet } from '@betterlabo/shared';

const EM_DASH = '\u2014';

/** The source's own "Total …" rows. They are sums of other rows, not components. */
const TOTAL_LABEL = /^\s*total\b/i;

export function isTotalLabel(label: string): boolean {
  return TOTAL_LABEL.test(label);
}

/** Case- and punctuation-insensitive key: "Service/ User Charges" === "Service/User Charges". */
export function normaliseLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/* ─────────────────────────────── basis strings ─────────────────────────────── */

export interface BasisParts {
  /** The basis string exactly as compiled. */
  raw: string;
  /** The BLGF workbook this section came from. */
  workbook: string;
  sheet: string | null;
  row: string | null;
  columns: string | null;
}

/**
 * A basis string reads `FY 2024 Statement of Receipts and Expenditures by LGU —
 * sheet "By LGU SRE FY2024", row 849, columns 9–11`. It is parsed for display
 * and grouped by, never used to look a section up: the ETL can rewrite a
 * workbook name and this page must follow it rather than break.
 */
export function parseBasis(basis: string): BasisParts {
  const raw = (basis ?? '').trim();
  const [head = '', ...rest] = raw.split(EM_DASH);
  const tail = rest.join(EM_DASH);
  const workbook = head.trim() || raw || 'Source workbook not named';
  return {
    raw,
    workbook,
    sheet: /sheet\s+"([^"]+)"/i.exec(tail)?.[1]?.trim() ?? null,
    row: /row\s+([^,\s]+)/i.exec(tail)?.[1]?.trim() ?? null,
    columns: /columns?\s+([^,]+)/i.exec(tail)?.[1]?.trim() ?? null,
  };
}

/** "FY 2024 Local Disaster Risk Reduction Management Fund by LGU" -> "Local Disaster Risk Reduction Management Fund". */
export function shortWorkbookLabel(workbook: string): string {
  const short = workbook
    .replace(/^FY\s*\d{4}\s*/i, '')
    .replace(/\s+by\s+LGU\s*$/i, '')
    .trim();
  return short || workbook;
}

export function groupKeyOf(sheet: FiscalSheet): string {
  const { workbook } = parseBasis(sheet.basis);
  return slugify(workbook) || sheet.sourceId || 'unattributed';
}

export interface WorkbookGroup {
  key: string;
  /** Short label for headings and chips. */
  label: string;
  /** The basis workbook name, verbatim. */
  full: string;
  sheets: FiscalSheet[];
  figureCount: number;
}

/** Group by the workbook named in each section's basis, in first-appearance order. */
export function groupByWorkbook(sheets: FiscalSheet[]): WorkbookGroup[] {
  const groups = new Map<string, WorkbookGroup>();
  for (const sheet of sheets) {
    const { workbook } = parseBasis(sheet.basis);
    const key = groupKeyOf(sheet);
    const existing = groups.get(key);
    if (existing) {
      existing.sheets.push(sheet);
      existing.figureCount += sheet.figures.length;
    } else {
      groups.set(key, {
        key,
        label: shortWorkbookLabel(workbook),
        full: workbook,
        sheets: [sheet],
        figureCount: sheet.figures.length,
      });
    }
  }
  return [...groups.values()];
}

/* ────────────────────────────── figures and zeros ─────────────────────────── */

export function figureIsZero(figure: FiscalFigure): boolean {
  return figure.amount === 0;
}

/** True when the source reports the section total *and* every row as zero. */
export function sheetIsAllZero(sheet: FiscalSheet): boolean {
  if (sheet.total !== 0) return false;
  return sheet.figures.length > 0 && sheet.figures.every(figureIsZero);
}

export function zeroFigureCount(sheet: FiscalSheet): number {
  return sheet.figures.filter(figureIsZero).length;
}

export interface RowSum {
  /** Sum of the rows the source lists, excluding its own "Total …" rows. */
  sum: number;
  /** Rows actually added. */
  counted: number;
  /** Rows whose amount is null (the source left the cell blank). */
  missing: number;
  /** Rows skipped because they are the source's own total. */
  excluded: number;
}

/**
 * Add up the rows a section lists, skipping the source's own total rows.
 *
 * Some sections publish a Total that is larger than the rows beneath it because
 * the source nests a sub-header one level deeper. Adding the listed rows is the
 * only honest way to show that difference instead of hiding it.
 */
export function sumListedRows(sheet: FiscalSheet): RowSum {
  let sum = 0;
  let counted = 0;
  let missing = 0;
  let excluded = 0;
  for (const figure of sheet.figures) {
    if (isTotalLabel(figure.label)) {
      excluded += 1;
      continue;
    }
    if (figure.amount == null) {
      missing += 1;
      continue;
    }
    sum += figure.amount;
    counted += 1;
  }
  return { sum, counted, missing, excluded };
}

/** Share of the listed rows, used only when the source published no share. */
export function derivedShare(sheet: FiscalSheet, figure: FiscalFigure): number | null {
  if (sheet.unit === '%' || figure.amount == null) return null;
  const { sum } = sumListedRows(sheet);
  if (!sum) return null;
  return (figure.amount / sum) * 100;
}

export function anchorOf(sheetId: string): string {
  return `sec-${slugify(sheetId) || 'section'}`;
}

/** Section totals of the given unit, for tiles that must not mix ₱ with %. */
export function findSection(sheets: FiscalSheet[], title: RegExp): FiscalSheet | null {
  return sheets.find((sheet) => title.test(sheet.title)) ?? null;
}

export interface FigureHit {
  sheet: FiscalSheet;
  figure: FiscalFigure;
}

/**
 * Find a row by its published label. Labels, not section ids, are what a reader
 * recognises — and unlike ids they survive the ETL regrouping a workbook.
 */
export function findFigure(
  sheets: FiscalSheet[],
  matcher: RegExp,
  opts: { unit?: 'PHP' | '%'; prefer?: 'largest' | 'first' } = {},
): FigureHit | null {
  const hits: FigureHit[] = [];
  for (const sheet of sheets) {
    if (opts.unit && sheet.unit !== opts.unit) continue;
    for (const figure of sheet.figures) {
      if (matcher.test(figure.label)) hits.push({ sheet, figure });
    }
  }
  const first = hits[0];
  if (!first) return null;
  if (opts.prefer !== 'largest') return first;
  return hits.reduce((best, hit) =>
    (hit.figure.amount ?? Number.NEGATIVE_INFINITY) > (best.figure.amount ?? Number.NEGATIVE_INFINITY)
      ? hit
      : best,
  );
}

/* ──────────────────────────────── filter state ─────────────────────────────── */

export const UNIT_FILTERS = ['all', 'PHP', '%'] as const;
export type UnitFilter = (typeof UNIT_FILTERS)[number];

export interface FiscalFilters {
  /** Free text, matched against section titles, row labels and basis strings. */
  q: string;
  /** Workbook group keys (see `groupKeyOf`). */
  books: string[];
  unit: UnitFilter;
  /** Hide rows — and sections — the source itself reports as zero. */
  hideZeros: boolean;
}

export const DEFAULT_FILTERS: FiscalFilters = { q: '', books: [], unit: 'all', hideZeros: false };

type ParamValue = string | string[] | undefined;

function firstValue(value: ParamValue): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function parseFilters(params: Record<string, ParamValue>): FiscalFilters {
  const q = firstValue(params.q).trim().slice(0, 80);
  const books = firstValue(params.book)
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
    .slice(0, 12);
  const unitParam = firstValue(params.unit).toLowerCase();
  const unit: UnitFilter =
    unitParam === 'php' ? 'PHP' : unitParam === 'pct' || unitParam === '%' ? '%' : 'all';
  return { q, books, unit, hideZeros: firstValue(params.zeros) === 'hide' };
}

export function buildQuery(filters: FiscalFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.books.length > 0) params.set('book', filters.books.join(','));
  if (filters.unit === 'PHP') params.set('unit', 'php');
  if (filters.unit === '%') params.set('unit', 'pct');
  if (filters.hideZeros) params.set('zeros', 'hide');
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function filtersActive(filters: FiscalFilters): boolean {
  return Boolean(filters.q) || filters.books.length > 0 || filters.unit !== 'all' || filters.hideZeros;
}

export function toggleBook(books: string[], key: string): string[] {
  return books.includes(key) ? books.filter((book) => book !== key) : [...books, key];
}

export function sheetMatchesText(sheet: FiscalSheet, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [sheet.title, sheet.id, sheet.basis, sheet.note ?? '']
    .concat(sheet.figures.flatMap((figure) => [figure.label, figure.note ?? '']))
    .join(' \n ')
    .toLowerCase();
  // Every token must appear somewhere: "health 94992892" narrows, never widens.
  return needle.split(/\s+/).every((token) => haystack.includes(token));
}

export function filterSheets(sheets: FiscalSheet[], filters: FiscalFilters): FiscalSheet[] {
  return sheets.filter((sheet) => {
    if (filters.unit !== 'all' && sheet.unit !== filters.unit) return false;
    if (filters.books.length > 0 && !filters.books.includes(groupKeyOf(sheet))) return false;
    if (filters.hideZeros && sheetIsAllZero(sheet)) return false;
    return sheetMatchesText(sheet, filters.q);
  });
}

/**
 * Sections per workbook if that workbook were the only one selected — the
 * faceted-search rule, so a chip's count never lies about what clicking it does.
 */
export function facetCounts(sheets: FiscalSheet[], filters: FiscalFilters): Map<string, number> {
  const counts = new Map<string, number>();
  for (const sheet of sheets) {
    if (filters.unit !== 'all' && sheet.unit !== filters.unit) continue;
    if (filters.hideZeros && sheetIsAllZero(sheet)) continue;
    if (!sheetMatchesText(sheet, filters.q)) continue;
    const key = groupKeyOf(sheet);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/* ───────────────────────────── name collisions ────────────────────────────── */

export interface LabelCollision {
  label: string;
  sections: Array<{ id: string; title: string; amount: number | null }>;
}

/**
 * The same row label published in more than one section. "Total Current
 * Operating Expenditures" appears twice in the FY 2024 workbooks with two
 * different amounts, so a reader must never be able to add them up by accident.
 */
export function findLabelCollisions(sheets: FiscalSheet[]): LabelCollision[] {
  const byKey = new Map<string, LabelCollision>();
  for (const sheet of sheets) {
    for (const figure of sheet.figures) {
      const key = normaliseLabel(figure.label);
      if (!key) continue;
      const entry = byKey.get(key) ?? { label: figure.label, sections: [] };
      if (!entry.sections.some((section) => section.id === sheet.id)) {
        entry.sections.push({ id: sheet.id, title: sheet.title, amount: figure.amount });
      }
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()]
    .filter((entry) => entry.sections.length > 1)
    .sort((a, b) => b.sections.length - a.sections.length || a.label.localeCompare(b.label));
}

/** normalised label -> titles of the *other* sections publishing it. */
export function collisionIndex(sheets: FiscalSheet[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const collision of findLabelCollisions(sheets)) {
    index.set(
      normaliseLabel(collision.label),
      collision.sections.map((section) => section.title),
    );
  }
  return index;
}

/* ─────────────────────────────── provenance ───────────────────────────────── */

/**
 * The registry entry that produced fiscal.json. Resolved from the sections'
 * own `sourceId`, falling back to whichever entry names the output file, so a
 * renamed dataset id does not lose the link to the workbook.
 */
export function resolveFiscalDataset(
  datasets: DatasetProvenance[],
  sourceIds: string[],
  publicPath: string,
): DatasetProvenance | null {
  for (const sourceId of sourceIds) {
    const match = datasets.find((dataset) => dataset.id === sourceId);
    if (match) return match;
  }
  return (
    datasets.find((dataset) => dataset.outputs.some((output) => output.includes(publicPath))) ?? null
  );
}

export { EM_DASH };
