'use client';

import { useState } from 'react';
import { CircleHelp, Loader2, Save, Wand2, X } from 'lucide-react';

import {
  formatDateTime,
  REPORT_DEFAULT_OFFICE,
  REPORT_CATEGORY_LABELS,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
  REPORT_STATUS_LABELS,
  type Report,
  type ReportPriority,
  type ReportStatus,
  type UpdateReportInput,
} from '@betterlabo/shared';

import { StatusBadge } from '@/components/report/status-badge';
import { ApiError, apiPatch, describeError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { ConsoleErrorNotice, DbUnavailableNotice } from './notices';

const PRIORITY_LABELS: Record<ReportPriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const inputClass =
  'w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3 py-2.5 text-sm text-ink transition-colors focus:border-brand-600';

/**
 * The console's detail + triage view.
 *
 * The API has no `GET /api/admin/reports/:id`, so the record being edited always
 * comes from the list the operator is already looking at; the PATCH returns the
 * updated report (including the new history entry) and that is what the panel
 * shows next.
 */
export function ReportEditor({
  report,
  onUpdated,
  onClose,
}: {
  report: Report;
  onUpdated: (report: Report) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [priority, setPriority] = useState<ReportPriority>(report.priority);
  const [assignedOffice, setAssignedOffice] = useState(report.assignedOffice ?? '');
  const [resolutionNote, setResolutionNote] = useState(report.resolutionNote ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbOff, setDbOff] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const suggestedOffice = REPORT_DEFAULT_OFFICE[report.category];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSavedAt(null);

    const patch: UpdateReportInput = {};
    if (status !== report.status) patch.status = status;
    if (priority !== report.priority) patch.priority = priority;

    const office = assignedOffice.trim();
    if (office !== (report.assignedOffice ?? '')) patch.assignedOffice = office === '' ? null : office;

    const note = resolutionNote.trim();
    if (note !== (report.resolutionNote ?? ''))
      patch.resolutionNote = note === '' ? null : note;

    if (Object.keys(patch).length === 0) {
      setError('Nothing has changed yet. Update a field, then save.');
      return;
    }

    setBusy(true);
    try {
      const res = await apiPatch<{ item: Report }>(
        `/api/admin/reports/${encodeURIComponent(report.id)}`,
        patch,
      );
      onUpdated(res.item);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      if (err instanceof ApiError && err.code === 'db_unavailable') {
        setDbOff(true);
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Your console session expired. Reload the page and sign in again.');
      } else {
        setError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col" aria-labelledby="report-detail-title">
      <header className="flex items-start justify-between gap-3 border-b border-rule p-4 sm:p-5">
        <div className="min-w-0">
          <p className="eyebrow">Report</p>
          <h2
            id="report-detail-title"
            className="figure-num truncate text-lg font-bold tracking-tight text-ink"
          >
            {report.referenceCode}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={report.status} />
            <span className="rounded-pill border border-rule-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink-support capitalize">
              {PRIORITY_LABELS[report.priority]}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-rule-strong text-ink-support transition-colors hover:border-brand-400 hover:text-ink"
        >
          <X aria-hidden className="size-4" />
          <span className="sr-only">Close the detail panel</span>
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact term="Category">{REPORT_CATEGORY_LABELS[report.category]}</Fact>
          <Fact term="Barangay">{report.barangayName}</Fact>
          <Fact term="Where">{report.locationLabel}</Fact>
          <Fact term="Reported">{formatDateTime(report.createdAt)}</Fact>
          <Fact term="Reporter">{report.reporterName ?? 'Anonymous'}</Fact>
          <Fact term="Contact">{report.reporterContact ?? 'Not given'}</Fact>
          {report.location ? (
            <Fact term="Coordinates">
              <span className="figure-num">
                {report.location.lat}, {report.location.lng}
              </span>
            </Fact>
          ) : null}
        </dl>

        <div>
          <p className="eyebrow">Subject</p>
          <p className="mt-1 text-sm font-semibold text-ink">{report.subject}</p>
          <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ink-support">
            {report.details}
          </p>
        </div>

        <div className="rule-y" />

        {dbOff ? <DbUnavailableNotice /> : null}
        {error ? (
          <ConsoleErrorNotice title="Could not save this update" message={error} />
        ) : null}
        {savedAt ? (
          <p
            role="status"
            className="rounded-lg border border-accent-green-200 bg-accent-green-50 px-3 py-2 text-sm font-semibold text-accent-green-700"
          >
            Saved. The public lookup screen now shows this status.
          </p>
        ) : null}

        <form noValidate onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="edit-status" className="text-sm font-semibold text-ink">
              Status
            </label>
            <select
              id="edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ReportStatus)}
              className={inputClass}
            >
              {REPORT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {REPORT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="edit-priority" className="text-sm font-semibold text-ink">
              Priority
            </label>
            <select
              id="edit-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as ReportPriority)}
              className={inputClass}
            >
              {REPORT_PRIORITIES.map((value) => (
                <option key={value} value={value}>
                  {PRIORITY_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="edit-office" className="text-sm font-semibold text-ink">
              Assigned office
            </label>
            <input
              id="edit-office"
              type="text"
              maxLength={160}
              value={assignedOffice}
              onChange={(e) => setAssignedOffice(e.target.value)}
              placeholder="Municipal Engineering Office (MEO)"
              className={inputClass}
            />
            {suggestedOffice ? (
              <p className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-ink-subtle">
                <CircleHelp aria-hidden className="size-3.5 shrink-0" />
                Routing hint for this category:
                <span className="font-semibold text-ink-support">{suggestedOffice}</span>
                <button
                  type="button"
                  onClick={() => setAssignedOffice(suggestedOffice)}
                  className="inline-flex items-center gap-1 font-semibold text-brand-700 underline"
                >
                  <Wand2 aria-hidden className="size-3.5" />
                  Use it
                </button>
              </p>
            ) : (
              <p className="text-xs leading-relaxed text-ink-subtle">
                No default office is defined for this category.
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="edit-note" className="text-sm font-semibold text-ink">
              Resolution note
            </label>
            <textarea
              id="edit-note"
              rows={4}
              maxLength={2000}
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="What was done, or why the report was closed. This is public."
              className={cn(inputClass, 'min-h-24 resize-y')}
            />
            <p className="text-xs leading-relaxed text-ink-subtle">
              Any text here is shown on the public lookup screen.
            </p>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-900 px-4 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 aria-hidden className="size-4 animate-spin" />
            ) : (
              <Save aria-hidden className="size-4" />
            )}
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>

        <div className="rule-y" />

        <div>
          <h3 className="text-sm font-bold text-ink">History</h3>
          {report.history.length === 0 ? (
            <p className="mt-2 text-sm text-ink-subtle">No events recorded yet.</p>
          ) : (
            <ol className="mt-3 grid gap-3">
              {report.history.map((event, index) => (
                <li key={`${event.at}-${index}`} className="flex gap-2.5">
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      event.actor === 'console'
                        ? 'bg-brand-600'
                        : event.actor === 'citizen'
                          ? 'bg-accent-orange-500'
                          : 'bg-gray-400',
                    )}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{event.action}</p>
                    {event.note ? (
                      <p className="text-xs leading-relaxed text-ink-support">{event.note}</p>
                    ) : null}
                    <p className="text-xs text-ink-subtle">
                      {formatDateTime(event.at)} · {event.actor}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{term}</dt>
      <dd className="mt-1 truncate text-sm text-ink" title={typeof children === 'string' ? children : undefined}>
        {children}
      </dd>
    </div>
  );
}
