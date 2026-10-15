'use client';

/**
 * The map's barangay search. It is a real ARIA combobox rather than a styled
 * input: arrow keys move through the results, Enter selects, Escape clears, and
 * the active option is announced through `aria-activedescendant`. Selecting a
 * result is the keyboard route to every polygon on the map.
 */
import { Search, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { formatArea } from '@betterlabo/shared';

import { searchBarangays } from './map-config';
import type { MapBarangay } from './types';

const MAX_RESULTS = 8;

export interface MapSearchProps {
  barangays: MapBarangay[];
  totalCount: number;
  onSelect: (psgcCode: string) => void;
  className?: string;
}

export function MapSearch({ barangays, totalCount, onSelect, className }: MapSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement | null>(null);

  const results = useMemo(
    () => searchBarangays(barangays, query, MAX_RESULTS),
    [barangays, query],
  );
  const hasQuery = query.trim().length > 0;
  const active = results[Math.min(activeIndex, Math.max(0, results.length - 1))];

  const commit = useCallback(
    (barangay: MapBarangay | undefined) => {
      if (!barangay) return;
      onSelect(barangay.psgcCode);
      setQuery('');
      setOpen(false);
      setActiveIndex(0);
    },
    [onSelect],
  );

  const move = (delta: number) => {
    if (results.length === 0) return;
    setOpen(true);
    setActiveIndex((index) => {
      const next = index + delta;
      if (next < 0) return results.length - 1;
      if (next >= results.length) return 0;
      return next;
    });
  };

  return (
    <div className={cn('relative', className)}>
      <label htmlFor="map-barangay-search" className="sr-only">
        Search barangays
      </label>
      <div className="flex items-center gap-2 rounded-card border border-rule bg-surface px-3 py-2 shadow-card focus-within:border-brand-400">
        <Search aria-hidden className="size-4 shrink-0 text-ink-subtle" />
        <input
          id="map-barangay-search"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="map-barangay-results"
          aria-autocomplete="list"
          aria-activedescendant={open && active ? `map-barangay-option-${active.psgcCode}` : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={`Search ${totalCount} barangays…`}
          value={query}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle [&::-webkit-search-cancel-button]:hidden"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              move(-1);
            } else if (event.key === 'Enter') {
              event.preventDefault();
              commit(active);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              if (query) setQuery('');
              else setOpen(false);
            } else if (event.key === 'Home' && open) {
              setActiveIndex(0);
            } else if (event.key === 'End' && open) {
              setActiveIndex(Math.max(0, results.length - 1));
            }
          }}
        />
        {hasQuery ? (
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-ink-subtle transition-colors hover:text-ink"
            aria-label="Clear the search"
            onClick={() => {
              setQuery('');
              setActiveIndex(0);
            }}
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>

      {open ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-card border border-rule bg-surface shadow-raised">
          {results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-ink-support">
              {hasQuery
                ? `No barangay in Labo matches “${query.trim()}”.`
                : 'The barangay index is not compiled in this build, so there is nothing to search.'}
            </p>
          ) : (
            <ul
              id="map-barangay-results"
              ref={listRef}
              role="listbox"
              aria-label="Barangay search results"
              className="max-h-72 overflow-y-auto py-1"
            >
              {results.map((barangay, index) => (
                <li
                  key={barangay.psgcCode}
                  id={`map-barangay-option-${barangay.psgcCode}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm',
                    index === activeIndex ? 'bg-brand-50 text-brand-900' : 'text-ink',
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  // Keep focus in the input so the click lands before the blur closes the list.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => commit(barangay)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{barangay.displayName}</span>
                    {barangay.isPoblacion ? (
                      <span className="chip border-brand-300 bg-brand-50 text-brand-900">Pob.</span>
                    ) : null}
                  </span>
                  <span className="tnum shrink-0 text-xs text-ink-subtle">
                    {formatArea(barangay.areaSqKm)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!hasQuery && totalCount > results.length ? (
            <p className="border-t border-rule px-3 py-1.5 text-[0.6875rem] text-ink-subtle">
              Showing {results.length} of {totalCount} — keep typing to narrow it down.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
