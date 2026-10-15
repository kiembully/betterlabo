'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Printer, RotateCcw, Search, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { Chip } from '@/components/ui/primitives';

import {
  buildQuery,
  DEFAULT_FILTERS,
  filtersActive,
  toggleBook,
  type FiscalFilters,
  type UnitFilter,
} from './model';

export interface BookChip {
  key: string;
  label: string;
  /** Sections that would show if this workbook were the only one selected. */
  matched: number;
  /** Sections in the workbook overall. */
  total: number;
}

interface Props {
  filters: FiscalFilters;
  books: BookChip[];
  shown: number;
  total: number;
  figures: number;
  preliminary: boolean;
  fiscalYear: number | null;
}

const UNITS: Array<{ value: UnitFilter; label: string; title: string }> = [
  { value: 'all', label: 'All', title: 'Every section, pesos and ratios' },
  { value: 'PHP', label: '₱', title: 'Only sections measured in pesos' },
  { value: '%', label: '%', title: 'Only ratio sections — dependency percentages' },
];

/**
 * Filter bar for the budget explorer. It owns no data: every change is written
 * to the URL, and the server page re-renders from that URL, so a filtered view
 * is shareable, printable and identical for the next reader.
 */
export function BudgetFilterBar({
  filters,
  books,
  shown,
  total,
  figures,
  preliminary,
  fiscalYear,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const inputRef = useRef<HTMLInputElement>(null);

  // Follow the URL when it changes elsewhere (back button, a shared link), but
  // never while someone is typing into the field.
  useEffect(() => {
    if (typeof document !== 'undefined' && document.activeElement === inputRef.current) return;
    setQuery(filters.q);
  }, [filters.q]);

  // Stable across renders, so the debounce effect below cannot be restarted by an
  // unrelated re-render (a transition, a hover) and delay the navigation.
  const navigate = useCallback(
    (next: FiscalFilters) => {
      const href = `${pathname}${buildQuery(next)}`;
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [pathname, router],
  );

  // Debounced so typing does not issue a request per keystroke, and only when
  // the box disagrees with the URL.
  useEffect(() => {
    if (query === filters.q) return;
    const timer = setTimeout(() => navigate({ ...filters, q: query }), 250);
    return () => clearTimeout(timer);
  }, [query, filters, navigate]);

  const setAllDetails = (open: boolean) => {
    document
      .querySelectorAll<HTMLDetailsElement>('details[data-budget-section]')
      .forEach((node) => {
        node.open = open;
      });
  };

  return (
    <div className="no-print lg:sticky lg:top-16 lg:z-30">
      <div className="rounded-card border border-rule bg-surface/95 p-3 shadow-card backdrop-blur supports-[backdrop-filter]:bg-surface/85 sm:p-4">
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="budget-q" className="sr-only">
              Search {total} budget sections by title or row label
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
            />
            <input
              id="budget-q"
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search a section or a row: health, NTA, fund balance…"
              autoComplete="off"
              className="w-full rounded-md border border-rule-strong bg-surface py-2.5 pr-9 pl-9 text-sm text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-ink-subtle hover:text-ink"
              >
                <span className="sr-only">Clear the search</span>
                <X aria-hidden className="size-4" />
              </button>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => window.print()}
            title="Print or save these figures as PDF"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-rule-strong bg-surface px-3 py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
          >
            <Printer aria-hidden className="size-4" />
            <span className="hidden xs:inline">Print</span>
            <span className="sr-only xs:hidden">Print</span>
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filter by unit"
            className="inline-flex overflow-hidden rounded-md border border-rule-strong"
          >
            {UNITS.map((unit) => {
              const active = filters.unit === unit.value;
              return (
                <button
                  key={unit.value}
                  type="button"
                  title={unit.title}
                  aria-pressed={active}
                  onClick={() => navigate({ ...filters, unit: unit.value })}
                  className={cn(
                    'px-3 py-2 text-sm font-semibold transition-colors',
                    active ? 'bg-brand-900 text-brand-50' : 'bg-surface text-ink-support hover:bg-gray-100',
                  )}
                >
                  {unit.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={filters.hideZeros}
            onClick={() => navigate({ ...filters, hideZeros: !filters.hideZeros })}
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition-colors',
              filters.hideZeros
                ? 'border-brand-900 bg-brand-900 text-brand-50'
                : 'border-rule-strong bg-surface text-ink-support hover:border-brand-300',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'grid size-3.5 place-items-center rounded-[3px] border text-[9px] leading-none',
                filters.hideZeros ? 'border-brand-50' : 'border-rule-strong',
              )}
            >
              {filters.hideZeros ? '✓' : ''}
            </span>
            Hide rows reported as zero
          </button>

          <button
            type="button"
            onClick={() => setAllDetails(true)}
            className="rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-support transition-colors hover:border-brand-300"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setAllDetails(false)}
            className="rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm font-semibold text-ink-support transition-colors hover:border-brand-300"
          >
            Collapse all
          </button>
        </div>

        {books.length > 1 ? (
          <div className="mt-2.5 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none">
            {books.map((book) => {
              const active = filters.books.includes(book.key);
              const empty = book.matched === 0 && !active;
              return (
                <button
                  key={book.key}
                  type="button"
                  aria-pressed={active}
                  disabled={empty}
                  title={`${book.label} — ${book.total} section${book.total === 1 ? '' : 's'}${
                    empty ? ' (no match for the current filters)' : ''
                  }`}
                  onClick={() => navigate({ ...filters, books: toggleBook(filters.books, book.key) })}
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors',
                    active
                      ? 'border-brand-900 bg-brand-900 text-brand-50'
                      : 'border-rule-strong bg-surface text-ink-support hover:border-brand-300',
                    empty && 'cursor-not-allowed opacity-40',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'size-1.5 rounded-full',
                      active ? 'bg-brand-50' : 'bg-rule-strong',
                    )}
                  />
                  {book.label}
                  <span className={cn('figure-num', active ? 'text-brand-100' : 'text-ink-subtle')}>
                    {book.matched}/{book.total}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-subtle">
          <span aria-live="polite">
            Showing <strong className="figure-num text-ink">{shown}</strong> of {total} sections ·{' '}
            <strong className="figure-num text-ink">{figures}</strong> rows
          </span>
          {preliminary ? (
            <Chip tone="warn" title="BLGF marks FY 2024 as preliminary in the source workbook">
              Preliminary{fiscalYear ? ` FY ${fiscalYear}` : ''}
            </Chip>
          ) : null}
          {filtersActive(filters) ? (
            <button
              type="button"
              onClick={() => navigate({ ...DEFAULT_FILTERS })}
              className="inline-flex items-center gap-1 font-semibold text-brand-700 underline"
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Clear filters
            </button>
          ) : null}
          {pending ? (
            <span className="text-ink-subtle" aria-hidden>
              updating…
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
