import { REPORT_STATUS_LABELS, type ReportStatus } from '@betterlabo/shared';

import { cn } from '@/lib/cn';

/**
 * Status pill. The palette comes from the `status-*` theme colours in
 * globals.css so the received/acknowledged/in-progress/resolved/closed/rejected
 * scale is identical on the public lookup screen and in the console.
 */
const TONE: Record<ReportStatus, string> = {
  received: 'border-status-received/40 bg-status-received/10 text-status-received',
  acknowledged: 'border-status-acknowledged/40 bg-status-acknowledged/10 text-status-acknowledged',
  in_progress: 'border-status-progress/40 bg-status-progress/10 text-status-progress',
  resolved: 'border-status-resolved/40 bg-status-resolved/10 text-status-resolved',
  closed: 'border-status-closed/40 bg-status-closed/10 text-status-closed',
  rejected: 'border-status-rejected/40 bg-status-rejected/10 text-status-rejected',
};

export function StatusBadge({
  status,
  className,
}: {
  status: ReportStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-semibold whitespace-nowrap',
        TONE[status],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      {REPORT_STATUS_LABELS[status]}
    </span>
  );
}
