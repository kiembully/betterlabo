import { AlertTriangle } from 'lucide-react';

import { EMERGENCY_NOTICE } from '@betterlabo/shared';

import { cn } from '@/lib/cn';

/**
 * The standing emergency notice. It is deliberately loud: this channel is an
 * asynchronous grievance/request queue that empties on office hours, so it must
 * never read as a way to get help during a flood or a fire.
 */
export function EmergencyBanner({ className }: { className?: string }) {
  return (
    <div
      role="note"
      className={cn(
        'flex items-start gap-3 rounded-card border border-accent-red-200 bg-accent-red-50 p-4 sm:p-5',
        className,
      )}
    >
      <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-red-700" />
      <div>
        <p className="eyebrow text-accent-red-700">Not an emergency channel</p>
        <p className="mt-1.5 text-sm leading-relaxed font-semibold text-accent-red-700">
          {EMERGENCY_NOTICE}
        </p>
      </div>
    </div>
  );
}
