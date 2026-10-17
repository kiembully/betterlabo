import { APPOINTMENT_STATUS_LABELS, type AppointmentStatus } from '@betterlabo/shared';

import { cn } from '@/lib/cn';

/**
 * Status pill for an appointment.
 *
 * The palette reuses the same `status-*` theme colours as the report badge, so
 * requested/confirmed/rescheduled/completed/cancelled/no-show reads identically
 * on the public lookup screen and in the console. `requested` is deliberately
 * the neutral grey: an unanswered request is not progress, and it must not look
 * like one.
 */
const TONE: Record<AppointmentStatus, string> = {
  requested: 'border-status-received/40 bg-status-received/10 text-status-received',
  confirmed: 'border-status-acknowledged/40 bg-status-acknowledged/10 text-status-acknowledged',
  rescheduled: 'border-status-progress/40 bg-status-progress/10 text-status-progress',
  completed: 'border-status-resolved/40 bg-status-resolved/10 text-status-resolved',
  cancelled: 'border-status-rejected/40 bg-status-rejected/10 text-status-rejected',
  no_show: 'border-status-closed/40 bg-status-closed/10 text-status-closed',
};

export function AppointmentStatusBadge({
  status,
  className,
}: {
  status: AppointmentStatus;
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
      {APPOINTMENT_STATUS_LABELS[status]}
    </span>
  );
}
