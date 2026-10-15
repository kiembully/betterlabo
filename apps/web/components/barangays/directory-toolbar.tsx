'use client';

import { formatArea, pluralize } from '@betterlabo/shared';

import { cn } from '@/lib/cn';

import {
  DIRECTORY_FILTERS,
  DIRECTORY_SORTS,
  FILTER_HINTS,
  FILTER_LABELS,
  SORT_LABELS,
  isDefaultDirectoryState,
  type DirectoryFilter,
  type DirectoryState,
} from './directory-state';

/**
 * Search, class filter and sort. Every control is URL-backed — the parent owns
 * the state and the address bar, this component only renders it and reports
 * changes, so a filtered view can always be copied out of the browser.
 */
export function DirectoryToolbar({
  state,
  counts,
  resultCount,
  totalCount,
  filteredAreaSqKm,
  totalAreaSqKm,
  pending,
  onChange,
  onReset,
}: {
  state: DirectoryState;
  counts: Record<DirectoryFilter, number>;
  resultCount: number;
  totalCount: number;
  filteredAreaSqKm: number;
  totalAreaSqKm: number;
  pending: boolean;
  onChange: (patch: Partial<DirectoryState>) => void;
  onReset: () => void;
}) {
  const filtered = !isDefaultDirectoryState(state);
  const areaShare = totalAreaSqKm > 0 ? (filteredAreaSqKm / totalAreaSqKm) * 100 : 0;

  return (
    <div className="card p-4 sm:p-5" aria-busy={pending || undefined}>
      <form
        role="search"
        onSubmit={(event) => event.preventDefault()}
        className="flex flex-col gap-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-1">
          <label htmlFor="barangay-search" className="sr-only">
            Search barangays by name or PSGC code
          </label>
          <svg
            aria-hidden
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
          >
            <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            id="barangay-search"
            name="q"
            type="search"
            value={state.q}
            autoComplete="off"
            spellCheck={false}
            placeholder="Anahaw, Mabilo, 0501606012…"
            onChange={(event) => onChange({ q: event.target.value })}
            className="w-full rounded-md border border-rule-strong bg-surface py-2.5 pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="barangay-sort" className="eyebrow shrink-0">
            Sort
          </label>
          <select
            id="barangay-sort"
            value={state.sort}
            onChange={(event) => onChange({ sort: event.target.value as DirectoryState['sort'] })}
            className="w-full rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-sm font-semibold text-ink focus:border-brand-500 sm:w-auto"
          >
            {DIRECTORY_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {DIRECTORY_FILTERS.map((filter) => {
          const active = state.filter === filter;
          return (
            <button
              key={filter}
              type="button"
              aria-pressed={active}
              title={FILTER_HINTS[filter]}
              onClick={() => onChange({ filter })}
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors',
                active
                  ? 'border-brand-300 bg-brand-50 text-brand-900'
                  : 'border-rule-strong bg-surface text-ink-support hover:border-brand-300 hover:text-ink',
              )}
            >
              {FILTER_LABELS[filter]}
              <span className="figure-num text-[0.6875rem] text-ink-subtle">{counts[filter]}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-subtle">
        <p
          role="status"
          aria-live="polite"
          className="flex flex-wrap items-center gap-x-2 gap-y-1"
        >
          <span className="font-semibold text-ink-support">
            {resultCount === totalCount
              ? `All ${pluralize(totalCount, 'barangay')}`
              : `${resultCount} of ${totalCount} ${pluralize(totalCount, 'barangay')}`}
          </span>
          <span aria-hidden>·</span>
          <span className="figure-num">{formatArea(filteredAreaSqKm)}</span>
          <span aria-hidden>·</span>
          <span className="figure-num">{areaShare.toFixed(1)}% of the municipal area</span>
          {pending ? <span>· updating the link</span> : null}
        </p>
        {filtered ? (
          <button
            type="button"
            onClick={onReset}
            className="ml-auto font-semibold text-brand-700 underline hover:text-brand-900"
          >
            Clear filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
