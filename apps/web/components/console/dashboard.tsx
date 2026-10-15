'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';

import {
  formatNumber,
  REPORT_CATEGORY_LABELS,
  REPORT_STATUS_LABELS,
  type ReportStats,
} from '@betterlabo/shared';

import { Eyebrow, Meter, StatTile } from '@/components/ui/primitives';
import { ApiError, apiGet, describeError } from '@/lib/api';

import { ConsoleErrorNotice, DbUnavailableNotice } from './notices';

type Phase = 'loading' | 'ready' | 'db_off' | 'error';

export function ConsoleDashboard() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [stats, setStats] = useState<ReportStats | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setMessage(null);
    try {
      const res = await apiGet<{ item: ReportStats }>('/api/admin/stats');
      setStats(res.item);
      setPhase('ready');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'db_unavailable') {
        setPhase('db_off');
        return;
      }
      setMessage(describeError(err));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = (
    <button
      type="button"
      onClick={() => void load()}
      className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
    >
      <RefreshCw aria-hidden className="size-4" />
      Retry
    </button>
  );

  if (phase === 'loading') {
    return (
      <p className="flex items-center gap-3 text-sm font-semibold text-ink-support">
        <Loader2 aria-hidden className="size-5 animate-spin text-brand-700" />
        Loading the reporting figures…
      </p>
    );
  }

  if (phase === 'db_off') return <DbUnavailableNotice action={retry} />;

  if (phase === 'error') {
    return (
      <ConsoleErrorNotice
        title="Could not load the reporting figures"
        message={message ?? 'Something went wrong.'}
        action={retry}
      />
    );
  }

  if (!stats) return null;

  const share = (count: number) =>
    stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Total received" value={formatNumber(stats.total)} tone="brand" />
        <StatTile label="Open" value={formatNumber(stats.open)} hint="Not yet resolved or closed" />
        <StatTile label="Resolved" value={formatNumber(stats.resolved)} />
        <StatTile label="Last 30 days" value={formatNumber(stats.last30Days)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="card p-5">
          <h2 className="text-base font-bold text-ink">By status</h2>
          {stats.byStatus.length === 0 ? (
            <p className="mt-3 text-sm text-ink-subtle">No reports yet.</p>
          ) : (
            <ul className="mt-4 grid gap-3.5">
              {stats.byStatus.map((row) => (
                <li key={row.status} className="grid gap-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">
                      {REPORT_STATUS_LABELS[row.status]}
                    </span>
                    <span className="figure-num text-sm text-ink-support">
                      {formatNumber(row.count)}
                    </span>
                  </div>
                  <Meter
                    value={share(row.count)}
                    label={`${REPORT_STATUS_LABELS[row.status]}: ${row.count} of ${stats.total}`}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-base font-bold text-ink">By category</h2>
          {stats.byCategory.length === 0 ? (
            <p className="mt-3 text-sm text-ink-subtle">No reports yet.</p>
          ) : (
            <ol className="mt-4 grid gap-2.5">
              {[...stats.byCategory]
                .sort((a, b) => b.count - a.count)
                .map((row) => (
                  <li key={row.category} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-sm text-ink-support">
                      {REPORT_CATEGORY_LABELS[row.category]}
                    </span>
                    <span className="figure-num shrink-0 text-sm font-semibold text-ink">
                      {formatNumber(row.count)}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </section>

        <section className="card p-5">
          <h2 className="text-base font-bold text-ink">By barangay</h2>
          {stats.byBarangay.length === 0 ? (
            <p className="mt-3 text-sm text-ink-subtle">No reports yet.</p>
          ) : (
            <ol className="mt-4 grid gap-2.5">
              {[...stats.byBarangay]
                .sort((a, b) => b.count - a.count)
                .slice(0, 12)
                .map((row) => (
                  <li key={row.barangayPsgc} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 text-sm text-ink-support">{row.barangayName}</span>
                    <span className="figure-num shrink-0 text-sm font-semibold text-ink">
                      {formatNumber(row.count)}
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </section>
      </div>

      <div className="text-xs leading-relaxed text-ink-subtle">
        <Eyebrow>Note</Eyebrow>
        <span className="mt-1 block">
          These figures cover the citizen reporting channel only. Nothing on the public site depends
          on them.
        </span>
      </div>
    </div>
  );
}
