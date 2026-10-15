'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';

import {
  formatDateTime,
  lookupReportSchema,
  REPORT_CATEGORY_LABELS,
  type PublicReport,
} from '@betterlabo/shared';

import { apiGet, describeError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { StatusBadge } from './status-badge';

/**
 * The lookup screen. There are no accounts, so the reference code IS the
 * credential — hence the uppercase normalisation and the exact-shape check
 * before a request is made.
 */
export function LookupForm({ initialCode = '' }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<PublicReport | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setReport(null);

    const parsed = lookupReportSchema.safeParse({ referenceCode: code });
    if (!parsed.success) {
      setFieldError(
        parsed.error.issues[0]?.message ?? 'Enter the reference code exactly as it was given.',
      );
      return;
    }

    setFieldError(null);
    setLoading(true);
    try {
      const res = await apiGet<{ item: PublicReport }>(
        `/api/reports/lookup?referenceCode=${encodeURIComponent(parsed.data.referenceCode)}`,
      );
      setReport(res.item);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <form noValidate onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="lookup-reference" className="text-sm font-semibold text-ink">
            Reference code
          </label>
          <p id="lookup-reference-hint" className="text-xs leading-relaxed text-ink-subtle">
            It looks like <span className="figure-num">LB-2026-000042</span> and was shown when the
            report was sent.
          </p>
          <input
            id="lookup-reference"
            name="referenceCode"
            type="text"
            required
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            placeholder="LB-2026-000042"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? 'lookup-reference-error' : 'lookup-reference-hint'}
            className={cn(
              'figure-num w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3.5 py-3 text-base tracking-wide text-ink transition-colors placeholder:text-ink-subtle focus:border-brand-600',
              fieldError && 'border-accent-red-500',
            )}
          />
          {fieldError ? (
            <p
              id="lookup-reference-error"
              className="flex items-start gap-1.5 text-xs font-semibold text-accent-red-700"
            >
              <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
              {fieldError}
            </p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-900 px-5 text-base font-semibold text-brand-50 transition-colors hover:bg-brand-800 disabled:opacity-60 sm:w-auto"
        >
          {loading ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <Search aria-hidden className="size-5" />
          )}
          {loading ? 'Looking up…' : 'Look up report'}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-accent-red-200 bg-accent-red-50 p-4"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-red-700" />
          <p className="text-sm leading-relaxed font-semibold text-accent-red-700">{error}</p>
        </div>
      ) : null}

      {report ? <ReportResult report={report} /> : null}
    </div>
  );
}

function ReportResult({ report }: { report: PublicReport }) {
  return (
    <article className="card p-5 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Reference</p>
          <p className="figure-num text-xl font-bold tracking-tight text-ink">
            {report.referenceCode}
          </p>
        </div>
        <StatusBadge status={report.status} />
      </div>

      <h2 className="mt-4 text-lg font-bold text-ink">{report.subject}</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-support">
        {REPORT_CATEGORY_LABELS[report.category]} · {report.barangayName} · {report.locationLabel}
      </p>

      <p className="mt-4 text-sm leading-relaxed whitespace-pre-line text-ink">{report.details}</p>

      <dl className="mt-5 grid gap-3 border-t border-rule pt-4 sm:grid-cols-2">
        <div>
          <dt className="eyebrow">Office handling it</dt>
          <dd className="mt-1 text-sm text-ink">{report.assignedOffice ?? 'Not routed yet'}</dd>
        </div>
        <div>
          <dt className="eyebrow">Last update</dt>
          <dd className="mt-1 text-sm text-ink">{formatDateTime(report.updatedAt)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Reported</dt>
          <dd className="mt-1 text-sm text-ink">{formatDateTime(report.createdAt)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Priority</dt>
          <dd className="mt-1 text-sm capitalize text-ink">{report.priority}</dd>
        </div>
      </dl>

      {report.resolutionNote ? (
        <div className="mt-5 rounded-lg border border-accent-green-200 bg-accent-green-50 p-4">
          <p className="eyebrow text-accent-green-700">Resolution note</p>
          <p className="mt-1.5 text-sm leading-relaxed text-accent-green-700">
            {report.resolutionNote}
          </p>
        </div>
      ) : null}

      {report.history.length > 0 ? (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="eyebrow">Progress</p>
          <ol className="mt-3 grid gap-3">
            {report.history.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-3">
                <span
                  aria-hidden
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">{event.action}</p>
                  {event.note ? (
                    <p className="text-sm leading-relaxed text-ink-support">{event.note}</p>
                  ) : null}
                  <p className="text-xs text-ink-subtle">
                    {formatDateTime(event.at)} · {event.actor}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="mt-5 text-xs leading-relaxed text-ink-subtle">
        For privacy this view never shows the reporter name or contact details.
      </p>
    </article>
  );
}
