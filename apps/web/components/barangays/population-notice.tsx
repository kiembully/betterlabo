import type { BarangayRecord } from '@betterlabo/shared';
import { formatNumber, formatPercent } from '@betterlabo/shared';

import { Eyebrow, Meter } from '@/components/ui/primitives';

/**
 * Population is the one field in this module with no machine-readable source:
 * the PSA publishes barangay-level census counts as publications, not as a
 * dataset on data.bettergov.ph, so every record carries `population: null` until
 * an official extract is dropped into `data/sources/`. Nothing here is estimated
 * or scaled from the municipal total — the field stays empty and says why.
 */
export const POPULATION_NOT_AVAILABLE = 'Not available';

const PENDING_TITLE =
  'No barangay-level PSA census extract is wired into this build. The field is left empty rather than estimated.';

/** A population figure, or a clearly labelled “not available” state. */
export function PopulationCell({ record }: { record: BarangayRecord }) {
  if (record.population != null) {
    const provenance = [record.populationSource, record.populationYear]
      .filter((part) => part != null && part !== '')
      .join(' · ');
    return (
      <span className="flex flex-col">
        <span className="figure-num text-sm text-ink">{formatNumber(record.population)}</span>
        {provenance ? (
          <span className="text-[0.6875rem] text-ink-subtle">{provenance}</span>
        ) : null}
      </span>
    );
  }

  return (
    <span className="text-xs font-semibold text-ink-subtle" title={PENDING_TITLE}>
      {POPULATION_NOT_AVAILABLE}
    </span>
  );
}

/**
 * The standing explanation of the gap: how many barangays actually carry a
 * census figure, and the verbatim reason compiled into `profile.json`.
 */
export function PopulationNotice({
  coveragePercent,
  withData,
  total,
  reason,
  subject,
}: {
  coveragePercent: number | null | undefined;
  withData: number;
  total: number;
  reason: string | null;
  /** What the notice is about, e.g. the barangay name. Omitted on the index. */
  subject?: string;
}) {
  const percent = coveragePercent ?? 0;
  const headline =
    withData === 0
      ? 'No barangay carries a census figure in this build'
      : `${withData} of ${total} barangays carry a census figure`;

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <div className="max-w-2xl">
          <Eyebrow>Population · not available</Eyebrow>
          <h2 className="mt-2 text-lg font-bold text-ink">{headline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-support">
            {reason ??
              'No barangay-level PSA census extract is published as a dataset, so the ETL has nothing to attach to these records.'}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
            A barangay with no source keeps the field empty. Population is never inferred from the
            municipal total, from the land area, or from a neighbouring barangay.
          </p>
          {subject ? (
            <p className="mt-3 text-xs text-ink-subtle">
              Applies to <span className="font-semibold text-ink-support">{subject}</span>.
            </p>
          ) : null}
        </div>

        <div className="w-full max-w-xs shrink-0">
          <p className="eyebrow">Census coverage</p>
          <p className="figure-num mt-1 text-2xl font-semibold text-ink">
            {formatPercent(percent)}
          </p>
          <p className="mt-1 text-xs text-ink-subtle">
            {withData} of {total} barangays have a population figure
          </p>
          <div className="mt-3">
            <Meter
              value={percent}
              label={`${formatPercent(percent)} of the barangays in this index have population data`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
