import { formatPercent } from '@betterlabo/shared';

import { cn } from '@/lib/cn';
import { Meter } from '@/components/ui/primitives';

import { areaSharePercent } from './directory-state';

/**
 * How much of Labo's land area one barangay holds. Two decimals because the
 * poblacion barangays are a fraction of a percent each — one decimal would print
 * the whole town core as "0.1%".
 */
export function AreaShare({
  areaSqKm,
  totalAreaSqKm,
  className,
}: {
  areaSqKm: number;
  totalAreaSqKm: number | null | undefined;
  className?: string;
}) {
  const share = areaSharePercent(areaSqKm, totalAreaSqKm);
  if (share === null) return <span className="text-xs text-ink-subtle">—</span>;

  const label = `Holds ${formatPercent(share, 2)} of the municipal land area`;
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="min-w-[2.5rem] flex-1">
        <Meter value={share} label={label} />
      </div>
      <span className="figure-num shrink-0 text-xs text-ink-support" title={label}>
        {formatPercent(share, 2)}
      </span>
    </div>
  );
}
