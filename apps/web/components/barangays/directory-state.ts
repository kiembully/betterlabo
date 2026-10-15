/**
 * The barangay directory's state *is* its query string.
 *
 * These helpers are pure and carry no directive, so the server page can parse
 * `searchParams` into an initial state and the client toolbar can write changes
 * back to the URL using the exact same rules. A shared link, a Back button and a
 * cold first render therefore cannot disagree about what is on screen.
 */
import { stripPoblacionSuffix, type BarangayRecord } from '@betterlabo/shared';

export const DIRECTORY_FILTERS = ['all', 'poblacion', 'rural'] as const;
export type DirectoryFilter = (typeof DIRECTORY_FILTERS)[number];

export const DIRECTORY_SORTS = ['name', 'area-desc', 'area-asc', 'code'] as const;
export type DirectorySort = (typeof DIRECTORY_SORTS)[number];

export interface DirectoryState {
  /** Free text matched against the name, the stripped name and the PSGC codes. */
  q: string;
  filter: DirectoryFilter;
  sort: DirectorySort;
}

export const DEFAULT_DIRECTORY_STATE: DirectoryState = {
  q: '',
  filter: 'all',
  sort: 'name',
};

export const FILTER_LABELS: Record<DirectoryFilter, string> = {
  all: 'All',
  poblacion: 'Poblacion',
  rural: 'Rural & upland',
};

export const FILTER_HINTS: Record<DirectoryFilter, string> = {
  all: 'Every barangay in the index',
  poblacion: 'Carries the “(Pob.)” suffix in the PSA release — the town core',
  rural: 'Everything outside the poblacion core',
};

export const SORT_LABELS: Record<DirectorySort, string> = {
  name: 'Name (A–Z)',
  'area-desc': 'Largest land area first',
  'area-asc': 'Smallest land area first',
  code: 'PSGC code',
};

/** Enough to hold a full barangay name without turning the URL into a payload. */
const SEARCH_MAX = 60;

/**
 * Next hands `searchParams` over as a plain record whose values may be arrays
 * (`?q=a&q=b`). Convert once, keeping the first value of a repeated key.
 */
export function toSearchParams(
  input: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string' && first.length > 0) params.set(key, first);
  }
  return params;
}

export function normalizeFilter(value: string | null): DirectoryFilter {
  return DIRECTORY_FILTERS.find((filter) => filter === value) ?? DEFAULT_DIRECTORY_STATE.filter;
}

export function normalizeSort(value: string | null): DirectorySort {
  return DIRECTORY_SORTS.find((sort) => sort === value) ?? DEFAULT_DIRECTORY_STATE.sort;
}

export function normalizeQuery(value: string | null): string {
  return (value ?? '').trim().slice(0, SEARCH_MAX);
}

/** Read state from an already-converted query string. Unknown values fall back. */
export function readDirectoryState(params: URLSearchParams): DirectoryState {
  return {
    q: normalizeQuery(params.get('q')),
    filter: normalizeFilter(params.get('filter')),
    sort: normalizeSort(params.get('sort')),
  };
}

/** Canonical query string for a state: stable key order, defaults omitted. */
export function buildDirectoryQuery(state: DirectoryState): string {
  const params = new URLSearchParams();
  const q = normalizeQuery(state.q);
  if (q) params.set('q', q);
  if (state.filter !== DEFAULT_DIRECTORY_STATE.filter) params.set('filter', state.filter);
  if (state.sort !== DEFAULT_DIRECTORY_STATE.sort) params.set('sort', state.sort);
  return params.toString();
}

export function isDefaultDirectoryState(state: DirectoryState): boolean {
  return buildDirectoryQuery(state) === '';
}

/** Everything a search term may match, lowercased once per record. */
function haystack(record: BarangayRecord): string {
  return [record.name, stripPoblacionSuffix(record.name), record.psgcCode, record.psgcId]
    .join(' ')
    .toLowerCase();
}

/** Every whitespace-separated term must match, so “mabilo 2” narrows the list. */
export function barangayMatchesQuery(record: BarangayRecord, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const terms = needle.split(/\s+/).filter((term) => term.length > 0);
  if (terms.length === 0) return true;
  const hay = haystack(record);
  return terms.every((term) => hay.includes(term));
}

export function matchesFilter(record: BarangayRecord, filter: DirectoryFilter): boolean {
  if (filter === 'poblacion') return record.isPoblacion;
  if (filter === 'rural') return !record.isPoblacion;
  return true;
}

function compareNames(a: BarangayRecord, b: BarangayRecord): number {
  return a.name.localeCompare(b.name, 'en');
}

/**
 * Records matching the query, in the requested order. Ties break on name so the
 * order is stable between the server render and the browser hydration.
 */
export function filterAndSortBarangays(
  records: readonly BarangayRecord[],
  state: DirectoryState,
): BarangayRecord[] {
  const matched = records.filter(
    (record) => matchesFilter(record, state.filter) && barangayMatchesQuery(record, state.q),
  );

  switch (state.sort) {
    case 'area-desc':
      return [...matched].sort((a, b) => b.areaSqKm - a.areaSqKm || compareNames(a, b));
    case 'area-asc':
      return [...matched].sort((a, b) => a.areaSqKm - b.areaSqKm || compareNames(a, b));
    case 'code':
      return [...matched].sort((a, b) => a.psgcCode.localeCompare(b.psgcCode, 'en'));
    default:
      return [...matched].sort(compareNames);
  }
}

/** Facet counts: how many records each filter would keep for the current query. */
export function countByFilter(
  records: readonly BarangayRecord[],
): Record<DirectoryFilter, number> {
  let poblacion = 0;
  for (const record of records) {
    if (record.isPoblacion) poblacion += 1;
  }
  return { all: records.length, poblacion, rural: records.length - poblacion };
}

/** A barangay's share of the municipal land area, or null when the total is 0. */
export function areaSharePercent(
  areaSqKm: number,
  totalAreaSqKm: number | null | undefined,
): number | null {
  if (!totalAreaSqKm || totalAreaSqKm <= 0) return null;
  return (areaSqKm / totalAreaSqKm) * 100;
}
