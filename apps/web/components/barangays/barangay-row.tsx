import Link from 'next/link';

import { formatArea, stripPoblacionSuffix } from '@betterlabo/shared';

import { Chip } from '@/components/ui/primitives';

import { AreaShare } from './area-share';
import { PopulationCell } from './population-notice';
import type { BarangayRecord } from '@betterlabo/shared';

/**
 * One barangay, twice: a full-width card for phones (nothing is squeezed at
 * 360 px) and a table row from `sm` up. Both lead to the same record page.
 */

function PoblacionChip({ isPoblacion }: { isPoblacion: boolean }) {
  if (!isPoblacion) return null;
  return (
    <Chip tone="brand" title="Carries the “(Pob.)” suffix in the PSA release — the town core">
      Poblacion
    </Chip>
  );
}

export function BarangayCard({
  record,
  totalAreaSqKm,
}: {
  record: BarangayRecord;
  totalAreaSqKm: number | null | undefined;
}) {
  return (
    <li className="min-w-0">
      <Link
        href={`/barangays/${record.psgcCode}`}
        className="card card-hover flex h-full flex-col gap-3 p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-bold text-ink">{stripPoblacionSuffix(record.name)}</p>
            <p className="figure-num mt-0.5 text-xs text-ink-subtle">PSGC {record.psgcCode}</p>
          </div>
          <PoblacionChip isPoblacion={record.isPoblacion} />
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          <div>
            <p className="eyebrow">Land area</p>
            <p className="figure-num mt-1 text-sm font-semibold text-ink">
              {formatArea(record.areaSqKm)}
            </p>
          </div>
          <div>
            <p className="eyebrow">Population</p>
            <p className="mt-1">
              <PopulationCell record={record} />
            </p>
          </div>
        </div>

        <AreaShare areaSqKm={record.areaSqKm} totalAreaSqKm={totalAreaSqKm} />

        <span className="mt-auto pt-1 text-xs font-semibold text-brand-700">
          Full record <span aria-hidden>→</span>
        </span>
      </Link>
    </li>
  );
}

export function BarangayTableRow({
  record,
  totalAreaSqKm,
}: {
  record: BarangayRecord;
  totalAreaSqKm: number | null | undefined;
}) {
  return (
    <tr className="border-b border-rule last:border-b-0 hover:bg-brand-50">
      <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-normal">
        <Link
          href={`/barangays/${record.psgcCode}`}
          className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-ink hover:text-brand-800 hover:underline"
        >
          <span>{stripPoblacionSuffix(record.name)}</span>
          <PoblacionChip isPoblacion={record.isPoblacion} />
        </Link>
      </th>
      <td className="figure-num hidden px-3 py-2.5 text-xs text-ink-support md:table-cell">
        {record.psgcCode}
      </td>
      <td className="figure-num px-3 py-2.5 text-right text-sm text-ink">
        {formatArea(record.areaSqKm)}
      </td>
      <td className="hidden px-3 py-2.5 sm:table-cell">
        <AreaShare areaSqKm={record.areaSqKm} totalAreaSqKm={totalAreaSqKm} className="min-w-[9rem]" />
      </td>
      <td className="px-3 py-2.5">
        <PopulationCell record={record} />
      </td>
    </tr>
  );
}
