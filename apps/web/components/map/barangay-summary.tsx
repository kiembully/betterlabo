'use client';

/**
 * The keyboard- and touch-friendly counterpart to the map popup: the same
 * barangay facts, but in the panel where they are reachable without a pointer.
 */
import Link from 'next/link';
import { ArrowRight, X } from 'lucide-react';

import { formatArea, formatNumber } from '@betterlabo/shared';

import { barangayHref } from './map-config';
import type { MapBarangay } from './types';

export interface BarangaySummaryProps {
  barangay: MapBarangay;
  onClear: () => void;
}

export function BarangaySummary({ barangay, onClear }: BarangaySummaryProps) {
  return (
    <div className="mt-6">
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">Selected barangay</p>
        <button
          type="button"
          onClick={onClear}
          className="rounded p-0.5 text-ink-subtle transition-colors hover:text-ink"
        >
          <X aria-hidden className="size-3.5" />
          <span className="sr-only">Clear the selected barangay</span>
        </button>
      </div>

      <h3 className="mt-1.5 flex flex-wrap items-center gap-2 text-base font-bold text-ink">
        {barangay.displayName}
        {barangay.isPoblacion ? (
          <span className="chip border-brand-300 bg-brand-50 text-brand-900">Poblacion</span>
        ) : null}
      </h3>
      <p className="figure-num text-xs text-ink-subtle">PSGC {barangay.psgcCode}</p>

      <dl className="mt-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule py-1.5">
          <dt className="text-xs font-semibold text-ink-subtle">Land area</dt>
          <dd className="figure-num text-sm text-ink">{formatArea(barangay.areaSqKm)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 border-b border-rule py-1.5">
          <dt className="text-xs font-semibold text-ink-subtle">Population</dt>
          <dd className="text-sm text-ink">
            {barangay.population == null ? (
              <span title="No barangay-level PSA census extract has been supplied yet.">
                Not reported in any wired source
              </span>
            ) : (
              <span className="figure-num">{formatNumber(barangay.population)}</span>
            )}
          </dd>
        </div>
        {barangay.centroid ? (
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-xs font-semibold text-ink-subtle">Centroid</dt>
            <dd className="figure-num text-sm text-ink">
              {barangay.centroid.lat.toFixed(5)}, {barangay.centroid.lng.toFixed(5)}
            </dd>
          </div>
        ) : null}
      </dl>

      <Link
        href={barangayHref(barangay.psgcCode)}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline"
      >
        Open the barangay page
        <ArrowRight aria-hidden className="size-3.5" />
      </Link>
    </div>
  );
}
