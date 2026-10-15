'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { Eyebrow } from '@/components/ui/primitives';

import { BarangayCard, BarangayTableRow } from './barangay-row';
import { DirectoryToolbar } from './directory-toolbar';
import {
  DEFAULT_DIRECTORY_STATE,
  SORT_LABELS,
  barangayMatchesQuery,
  buildDirectoryQuery,
  countByFilter,
  filterAndSortBarangays,
  readDirectoryState,
  type DirectoryState,
} from './directory-state';
import type { BarangayRecord } from '@betterlabo/shared';

/** Typing is instant; the address bar catches up once the user pauses. */
const URL_WRITE_DELAY_MS = 250;

/**
 * The searchable barangay directory.
 *
 * The records arrive as props from the server page (they live behind
 * `server-only`), the filter and sort state lives in the URL, and the list is
 * rendered twice on purpose: full-width cards below `sm` so nothing is squeezed
 * at 360 px, and a table above it. Both are the same data in the same order.
 */
export function BarangayDirectory({
  barangays,
  municipality,
  totalAreaSqKm,
  initialState,
}: {
  barangays: BarangayRecord[];
  municipality: string;
  totalAreaSqKm: number;
  initialState: DirectoryState;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [state, setState] = useState<DirectoryState>(initialState);
  const [pending, startTransition] = useTransition();
  /** The last query string this component wrote, or was rendered with. */
  const lastQuery = useRef(buildDirectoryQuery(initialState));

  // Adopt state that arrived from outside: Back/Forward, or a shared link.
  useEffect(() => {
    const current = searchParams.toString();
    if (current === lastQuery.current) return;
    lastQuery.current = current;
    setState(readDirectoryState(searchParams));
  }, [searchParams]);

  // Mirror state into the URL. Guarded by `lastQuery`, so adopting an external
  // change does not immediately write it back.
  useEffect(() => {
    const next = buildDirectoryQuery(state);
    if (next === lastQuery.current) return;
    const timer = window.setTimeout(() => {
      lastQuery.current = next;
      startTransition(() => {
        router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
      });
    }, URL_WRITE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [state, pathname, router]);

  const onChange = useCallback((patch: Partial<DirectoryState>) => {
    setState((previous) => ({ ...previous, ...patch }));
  }, []);

  const onReset = useCallback(() => setState(DEFAULT_DIRECTORY_STATE), []);

  const results = useMemo(() => filterAndSortBarangays(barangays, state), [barangays, state]);
  const queryMatches = useMemo(
    () => barangays.filter((record) => barangayMatchesQuery(record, state.q)),
    [barangays, state.q],
  );
  const counts = useMemo(() => countByFilter(queryMatches), [queryMatches]);
  const filteredAreaSqKm = useMemo(
    () => results.reduce((sum, record) => sum + record.areaSqKm, 0),
    [results],
  );

  return (
    <div>
      <DirectoryToolbar
        state={state}
        counts={counts}
        resultCount={results.length}
        totalCount={barangays.length}
        filteredAreaSqKm={filteredAreaSqKm}
        totalAreaSqKm={totalAreaSqKm}
        pending={pending}
        onChange={onChange}
        onReset={onReset}
      />

      <div className="mt-5" aria-busy={pending || undefined}>
        {results.length === 0 ? (
          <div className="card survey-grid p-6 sm:p-10">
            <Eyebrow>No matches</Eyebrow>
            <h3 className="mt-2 text-lg font-bold text-ink">
              {state.q ? `No barangay matches “${state.q}”` : 'No barangay matches this filter'}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-support">
              {municipality} has {barangays.length} barangays in this index. Search by the barangay
              name, by the name without its “(Pob.)” suffix, or by its PSGC code.
            </p>
            <button
              type="button"
              onClick={onReset}
              className="mt-4 inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
            >
              Clear the search and filters
            </button>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:hidden">
              {results.map((record) => (
                <BarangayCard
                  key={record.psgcCode}
                  record={record}
                  totalAreaSqKm={totalAreaSqKm}
                />
              ))}
            </ul>

            <div className="card hidden overflow-x-auto sm:block">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <caption className="sr-only">
                  Barangay directory: {results.length} of {barangays.length} barangays, sorted by{' '}
                  {SORT_LABELS[state.sort]}.
                </caption>
                <thead>
                  <tr className="border-b border-rule-strong">
                    <th scope="col" className="eyebrow py-3 pl-4">
                      Barangay
                    </th>
                    <th scope="col" className="eyebrow hidden px-3 py-3 md:table-cell">
                      PSGC
                    </th>
                    <th scope="col" className="eyebrow px-3 py-3 text-right">
                      Land area
                    </th>
                    <th scope="col" className="eyebrow hidden px-3 py-3 sm:table-cell">
                      Share of {municipality}
                    </th>
                    <th scope="col" className="eyebrow py-3 pr-4 pl-3">
                      Population
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((record) => (
                    <BarangayTableRow
                      key={record.psgcCode}
                      record={record}
                      totalAreaSqKm={totalAreaSqKm}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
