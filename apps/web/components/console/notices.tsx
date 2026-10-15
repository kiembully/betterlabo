import { AlertCircle, Database, ShieldAlert } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * The API boots without a database when `MONGODB_URI` is unset, and every
 * reporting route then answers `503 db_unavailable`. The console says exactly
 * that instead of rendering an empty table or a crash page — an operator must be
 * able to tell "nobody has reported anything" apart from "nothing is storing".
 */
export function DbUnavailableNotice({ action }: { action?: React.ReactNode }) {
  return (
    <section className="rounded-card border border-accent-orange-200 bg-accent-orange-50 p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <Database aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-orange-700" />
        <div className="min-w-0">
          <p className="eyebrow text-accent-orange-700">Reporting database unavailable</p>
          <h2 className="mt-1 text-base font-bold text-accent-orange-700">
            The API is running without a database
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-accent-orange-700">
            Nothing is being stored, so there are no reports to list or update. Citizen submissions
            are rejected with{' '}
            <span className="figure-num font-semibold">503 db_unavailable</span> until a MongoDB
            connection is configured.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-accent-orange-700">
            Set <code className="figure-num">MONGODB_URI</code> in{' '}
            <code className="figure-num">.env.local</code> at the repo root and restart the API — or
            run <code className="figure-num">npm run dev:memory</code> to boot an in-memory
            MongoDB for a review session.
          </p>
          {action ? <div className="mt-4">{action}</div> : null}
        </div>
      </div>
    </section>
  );
}

export function ConsoleErrorNotice({
  title = 'Could not load this view',
  message,
  action,
  tone = 'bad',
}: {
  title?: string;
  message: string;
  action?: React.ReactNode;
  tone?: 'bad' | 'warn';
}) {
  return (
    <section
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-card border p-4 sm:p-5',
        tone === 'bad'
          ? 'border-accent-red-200 bg-accent-red-50'
          : 'border-accent-orange-200 bg-accent-orange-50',
      )}
    >
      <AlertCircle
        aria-hidden
        className={cn(
          'mt-0.5 size-5 shrink-0',
          tone === 'bad' ? 'text-accent-red-700' : 'text-accent-orange-700',
        )}
      />
      <div className="min-w-0">
        <h2
          className={cn(
            'text-sm font-bold',
            tone === 'bad' ? 'text-accent-red-700' : 'text-accent-orange-700',
          )}
        >
          {title}
        </h2>
        <p
          className={cn(
            'mt-1 text-sm leading-relaxed',
            tone === 'bad' ? 'text-accent-red-700' : 'text-accent-orange-700',
          )}
        >
          {message}
        </p>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
    </section>
  );
}

export function ConsoleUnreachableNotice({ message }: { message: string }) {
  return (
    <section className="rounded-card border border-rule bg-surface p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden className="mt-0.5 size-5 shrink-0 text-ink-subtle" />
        <div className="min-w-0">
          <p className="eyebrow">Console API unreachable</p>
          <h2 className="mt-1 text-base font-bold text-ink">
            The reporting API did not answer
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-support">{message}</p>
          <p className="mt-3 text-sm leading-relaxed text-ink-subtle">
            Check that the API is running and that <span className="figure-num">/api</span> is
            mounted on this host, then retry.
          </p>
        </div>
      </div>
    </section>
  );
}
