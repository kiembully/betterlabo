'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search } from 'lucide-react';

import {
  APPOINTMENT_PURPOSE_LABELS,
  APPOINTMENT_SLOT_LABELS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  formatDate,
  type Appointment,
  type ListEnvelope,
} from '@betterlabo/shared';

import { AppointmentStatusBadge } from '@/components/appointments/status-badge';
import { ApiError, apiGet, describeError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { AppointmentEditor } from './appointment-editor';
import { ConsoleErrorNotice, DbUnavailableNotice } from './notices';

const PAGE_SIZE = 20;
const selectClass =
  'w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3 py-2.5 text-sm text-ink transition-colors focus:border-brand-600';

interface Filters {
  status: string;
  from: string;
  to: string;
  q: string;
}

type Phase = 'loading' | 'ready' | 'db_off' | 'error';

const EMPTY_FILTERS: Filters = { status: '', from: '', to: '', q: '' };

/**
 * The console's appointment queue.
 *
 * Modelled on `ReportsBrowser`: filters on the left, the selected request on the
 * right. The date range filters the *requested* date — the same field the
 * resident chose — so an operator clearing next week sees what was asked for.
 */
export function AppointmentsBrowser() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [qDraft, setQDraft] = useState('');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Appointment[]>([]);
  const [total, setTotal] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [message, setMessage] = useState<string | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const listRef = useRef<HTMLUListElement>(null);

  const load = useCallback(async () => {
    setPhase('loading');
    setMessage(null);

    const params = new URLSearchParams();
    if (filters.status) params.set('status', filters.status);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.q.trim()) params.set('q', filters.q.trim());
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));

    try {
      const res = await apiGet<ListEnvelope<Appointment>>(
        `/api/admin/appointments?${params.toString()}`,
      );
      setItems(res.items);
      setTotal(res.total);
      setPhase('ready');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'db_unavailable') {
        setPhase('db_off');
        return;
      }
      setMessage(
        err instanceof ApiError && err.status === 401
          ? 'Your console session expired. Reload the page and sign in again.'
          : describeError(err),
      );
      setPhase('error');
    }
  }, [filters, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  // Free-text search is debounced so a slow connection is not hammered per key.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((prev) => (prev.q === qDraft ? prev : { ...prev, q: qDraft }));
      setOffset(0);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [qDraft]);

  function updateFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setOffset(0);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setQDraft('');
    setOffset(0);
  }

  function handleUpdated(updated: Appointment) {
    setSelected(updated);
    setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
  }

  function handleDeleted(id: string) {
    setSelected(null);
    setItems((prev) => prev.filter((item) => item.id !== id));
    setTotal((prev) => Math.max(0, prev - 1));
  }

  const activeFilters =
    filters.status !== '' || filters.from !== '' || filters.to !== '' || filters.q.trim() !== '';

  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5">
        <section className="card p-4 sm:p-5" aria-label="Filters">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="grid gap-1.5">
              <label htmlFor="appointment-filter-q" className="text-xs font-semibold text-ink-support">
                Search
              </label>
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
                />
                <input
                  id="appointment-filter-q"
                  type="search"
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                  placeholder="Reference, name, service…"
                  className={cn(selectClass, 'pl-9')}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="appointment-filter-status"
                className="text-xs font-semibold text-ink-support"
              >
                Status
              </label>
              <select
                id="appointment-filter-status"
                value={filters.status}
                onChange={(e) => updateFilter('status', e.target.value)}
                className={selectClass}
              >
                <option value="">All statuses</option>
                {APPOINTMENT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {APPOINTMENT_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="appointment-filter-from"
                className="text-xs font-semibold text-ink-support"
              >
                Requested from
              </label>
              <input
                id="appointment-filter-from"
                type="date"
                value={filters.from}
                onChange={(e) => updateFilter('from', e.target.value)}
                className={cn(selectClass, 'figure-num')}
              />
            </div>

            <div className="grid gap-1.5">
              <label
                htmlFor="appointment-filter-to"
                className="text-xs font-semibold text-ink-support"
              >
                Requested to
              </label>
              <input
                id="appointment-filter-to"
                type="date"
                value={filters.to}
                onChange={(e) => updateFilter('to', e.target.value)}
                className={cn(selectClass, 'figure-num')}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
            >
              <RefreshCw aria-hidden className="size-4" />
              Refresh
            </button>
            {activeFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="text-sm font-semibold text-brand-700 underline"
              >
                Clear filters
              </button>
            ) : null}
            <p className="ml-auto text-xs text-ink-subtle" aria-live="polite">
              {phase === 'loading' ? 'Loading…' : `Showing ${from}–${to} of ${total}`}
            </p>
          </div>
        </section>

        {phase === 'db_off' ? (
          <DbUnavailableNotice
            action={
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink"
              >
                <RefreshCw aria-hidden className="size-4" />
                Retry
              </button>
            }
          />
        ) : null}

        {phase === 'error' ? (
          <ConsoleErrorNotice
            title="Could not load the appointments"
            message={message ?? 'Something went wrong.'}
            action={
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink"
              >
                <RefreshCw aria-hidden className="size-4" />
                Retry
              </button>
            }
          />
        ) : null}

        {phase === 'ready' && items.length === 0 ? (
          <section className="card survey-grid p-6 sm:p-8">
            <p className="eyebrow">Nothing to show</p>
            <h2 className="mt-2 text-lg font-bold text-ink">
              {activeFilters
                ? 'No appointments match these filters'
                : 'No appointments have been requested yet'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              {activeFilters
                ? 'Widen the filters, or clear them to see the full queue.'
                : 'Requests sent through the public form appear here as soon as they are stored.'}
            </p>
            {activeFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-4 text-sm font-semibold text-brand-700 underline"
              >
                Clear filters
              </button>
            ) : null}
          </section>
        ) : null}

        {phase !== 'db_off' && items.length > 0 ? (
          <section className="card overflow-hidden" aria-label="Appointments">
            <ul ref={listRef} className="divide-y divide-rule">
              {items.map((appointment) => {
                const isSelected = selected?.id === appointment.id;
                return (
                  <li key={appointment.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(appointment)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-surface-sunken sm:px-5',
                        isSelected && 'bg-brand-50',
                      )}
                    >
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                        <span className="figure-num text-sm font-bold tracking-tight text-ink">
                          {appointment.referenceCode}
                        </span>
                        <AppointmentStatusBadge status={appointment.status} />
                        <span className="ml-auto text-xs text-ink-subtle">
                          {formatDate(appointment.preferredDate)}
                        </span>
                      </span>
                      <span className="text-sm font-semibold text-ink">{appointment.fullName}</span>
                      <span className="text-xs text-ink-support">
                        {APPOINTMENT_PURPOSE_LABELS[appointment.purpose]} ·{' '}
                        {appointment.barangayName} · {APPOINTMENT_SLOT_LABELS[appointment.preferredSlot]}
                      </span>
                      <span className="text-xs text-ink-subtle">
                        {appointment.scheduledDate
                          ? `Booked ${appointment.scheduledDate}${appointment.scheduledSlot ? ` ${APPOINTMENT_SLOT_LABELS[appointment.scheduledSlot]}` : ''}`
                          : 'Not scheduled yet'}
                        {appointment.assignedOffice ? ` · ${appointment.assignedOffice}` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {total > PAGE_SIZE ? (
              <div className="flex items-center justify-between gap-3 border-t border-rule px-4 py-3 sm:px-5">
                <button
                  type="button"
                  onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                  disabled={offset === 0 || phase === 'loading'}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rule-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-brand-400 disabled:opacity-50"
                >
                  <ChevronLeft aria-hidden className="size-4" />
                  Newer
                </button>
                <span className="text-xs text-ink-subtle">
                  Page {Math.floor(offset / PAGE_SIZE) + 1} of{' '}
                  {Math.max(1, Math.ceil(total / PAGE_SIZE))}
                </span>
                <button
                  type="button"
                  onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                  disabled={offset + PAGE_SIZE >= total || phase === 'loading'}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-rule-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-brand-400 disabled:opacity-50"
                >
                  Older
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {phase === 'loading' && items.length === 0 ? (
          <p className="flex items-center gap-3 px-1 text-sm font-semibold text-ink-support">
            <Loader2 aria-hidden className="size-5 animate-spin text-brand-700" />
            Loading appointments…
          </p>
        ) : null}
      </div>

      <div className="min-w-0 lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:overflow-y-auto">
        {selected ? (
          <AppointmentEditor
            key={selected.id}
            appointment={selected}
            onUpdated={handleUpdated}
            onDeleted={handleDeleted}
            onClose={() => setSelected(null)}
          />
        ) : (
          <section className="card p-5">
            <CalendarClock aria-hidden className="size-5 text-ink-subtle" />
            <h2 className="mt-2 text-base font-bold text-ink">Select a request</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              Pick a row to see the applicant’s contact details, the requested slot and the
              scheduling controls. Confirm, reschedule, complete, cancel or mark a no-show there.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
