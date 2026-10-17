'use client';

import { useState } from 'react';
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  CircleHelp,
  Loader2,
  Save,
  Trash2,
  UserX,
  Wand2,
  X,
} from 'lucide-react';

import {
  APPOINTMENT_DEFAULT_OFFICE,
  APPOINTMENT_PURPOSE_LABELS,
  APPOINTMENT_SLOTS,
  APPOINTMENT_SLOT_LABELS,
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABELS,
  formatDateTime,
  type Appointment,
  type AppointmentSlot,
  type AppointmentStatus,
  type UpdateAppointmentInput,
} from '@betterlabo/shared';

import { ApiError, apiDelete, apiPatch, describeError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { AppointmentStatusBadge } from '@/components/appointments/status-badge';
import { ConsoleErrorNotice, DbUnavailableNotice } from './notices';

const inputClass =
  'w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3 py-2.5 text-sm text-ink transition-colors focus:border-brand-600';

/**
 * The console's detail + scheduling view for one appointment.
 *
 * The record being edited always comes from the list the operator is already
 * looking at; the PATCH returns the updated appointment (including the new
 * history entry) and that is what the panel shows next.
 *
 * The quick actions are the five things an operator actually does — confirm,
 * reschedule, complete, cancel, mark no-show — and each one is a status
 * transition the API validates. `scheduledDate` stays `null` until one of them
 * sets it, which is what keeps the public tracker honest.
 */
export function AppointmentEditor({
  appointment,
  onUpdated,
  onDeleted,
  onClose,
}: {
  appointment: Appointment;
  onUpdated: (appointment: Appointment) => void;
  onDeleted: (id: string) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<AppointmentStatus>(appointment.status);
  const [scheduledDate, setScheduledDate] = useState(appointment.scheduledDate ?? '');
  const [scheduledSlot, setScheduledSlot] = useState<AppointmentSlot | ''>(
    appointment.scheduledSlot ?? '',
  );
  const [assignedOffice, setAssignedOffice] = useState(appointment.assignedOffice ?? '');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbOff, setDbOff] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const suggestedOffice = APPOINTMENT_DEFAULT_OFFICE[appointment.purpose];

  /** Shared PATCH path. Returns true when the change was saved. */
  async function send(input: UpdateAppointmentInput): Promise<boolean> {
    setError(null);
    setSavedAt(null);
    setDbOff(false);
    setBusy(true);
    try {
      const res = await apiPatch<{ item: Appointment }>(
        `/api/admin/appointments/${encodeURIComponent(appointment.id)}`,
        input,
      );
      onUpdated(res.item);
      setSavedAt(new Date().toISOString());
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'db_unavailable') {
        setDbOff(true);
      } else if (err instanceof ApiError && err.status === 401) {
        setError('Your console session expired. Reload the page and sign in again.');
      } else {
        setError(describeError(err));
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Fields the operator has edited since the panel opened. */
  function pendingPatch(): UpdateAppointmentInput {
    const patch: UpdateAppointmentInput = {};
    if (status !== appointment.status) patch.status = status;

    const date = scheduledDate.trim();
    if (date !== (appointment.scheduledDate ?? '')) {
      patch.scheduledDate = date === '' ? null : date;
    }
    if (scheduledSlot !== (appointment.scheduledSlot ?? '')) {
      patch.scheduledSlot = scheduledSlot === '' ? null : scheduledSlot;
    }

    const office = assignedOffice.trim();
    if (office !== (appointment.assignedOffice ?? '')) {
      patch.assignedOffice = office === '' ? null : office;
    }
    return patch;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch = pendingPatch();
    if (Object.keys(patch).length === 0) {
      setError('Nothing has changed yet. Update a field, then save.');
      return;
    }
    await send(patch);
  }

  /**
   * A quick action. Confirm and Reschedule also carry whatever date and slot are
   * on screen, so an operator can book the slot in one click; the other three
   * only move the status.
   */
  async function quickAction(next: AppointmentStatus) {
    const patch: UpdateAppointmentInput = { status: next };
    if (next === 'confirmed' || next === 'rescheduled') {
      const date = scheduledDate.trim();
      if (date !== '') patch.scheduledDate = date;
      if (scheduledSlot !== '') patch.scheduledSlot = scheduledSlot;
    }
    const ok = await send(patch);
    if (ok) setStatus(next);
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete ${appointment.referenceCode}? This removes the request permanently. Use it only for spam or a duplicate.`,
    );
    if (!confirmed) return;

    setError(null);
    setSavedAt(null);
    setDbOff(false);
    setBusy(true);
    try {
      await apiDelete(`/api/admin/appointments/${encodeURIComponent(appointment.id)}`);
      onDeleted(appointment.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'db_unavailable') {
        setDbOff(true);
      } else {
        setError(describeError(err));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card flex flex-col" aria-labelledby="appointment-detail-title">
      <header className="flex items-start justify-between gap-3 border-b border-rule p-4 sm:p-5">
        <div className="min-w-0">
          <p className="eyebrow">Appointment</p>
          <h2
            id="appointment-detail-title"
            className="figure-num truncate text-lg font-bold tracking-tight text-ink"
          >
            {appointment.referenceCode}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <AppointmentStatusBadge status={appointment.status} />
            <span className="rounded-pill border border-rule-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink-support">
              {APPOINTMENT_PURPOSE_LABELS[appointment.purpose]}
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
          <Fact term="Applicant">{appointment.fullName}</Fact>
          <Fact term="Contact">{appointment.contact}</Fact>
          <Fact term="Barangay">{appointment.barangayName}</Fact>
          <Fact term="Requested on">{formatDateTime(appointment.createdAt)}</Fact>
          <Fact term="Prefers">
            <span className="figure-num">{appointment.preferredDate}</span> ·{' '}
            {APPOINTMENT_SLOT_LABELS[appointment.preferredSlot]}
          </Fact>
          <Fact term="Booked">
            {appointment.scheduledDate ? (
              <>
                <span className="figure-num">{appointment.scheduledDate}</span>
                {appointment.scheduledSlot ? ` · ${APPOINTMENT_SLOT_LABELS[appointment.scheduledSlot]}` : ''}
              </>
            ) : (
              'Not scheduled yet'
            )}
          </Fact>
        </dl>

        {appointment.notes ? (
          <div>
            <p className="eyebrow">Applicant’s note</p>
            <p className="mt-1 text-sm leading-relaxed whitespace-pre-line text-ink-support">
              {appointment.notes}
            </p>
          </div>
        ) : null}

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
            Saved. The public tracker now shows this status.
          </p>
        ) : null}

        <div>
          <p className="eyebrow">Quick actions</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <QuickAction
              icon={<CalendarCheck aria-hidden className="size-4" />}
              label="Confirm"
              busy={busy}
              onClick={() => void quickAction('confirmed')}
            />
            <QuickAction
              icon={<CalendarClock aria-hidden className="size-4" />}
              label="Reschedule"
              busy={busy}
              onClick={() => void quickAction('rescheduled')}
            />
            <QuickAction
              icon={<CheckCircle2 aria-hidden className="size-4" />}
              label="Complete"
              busy={busy}
              onClick={() => void quickAction('completed')}
            />
            <QuickAction
              icon={<Ban aria-hidden className="size-4" />}
              label="Cancel"
              busy={busy}
              onClick={() => void quickAction('cancelled')}
            />
            <QuickAction
              icon={<UserX aria-hidden className="size-4" />}
              label="No show"
              busy={busy}
              onClick={() => void quickAction('no_show')}
            />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
            Confirm and Reschedule also save the date and time below, if you have set them.
          </p>
        </div>

        <form noValidate onSubmit={handleSubmit} className="grid gap-4">
          <div className="grid gap-1.5">
            <label htmlFor="appointment-edit-status" className="text-sm font-semibold text-ink">
              Status
            </label>
            <select
              id="appointment-edit-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AppointmentStatus)}
              className={inputClass}
            >
              {APPOINTMENT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {APPOINTMENT_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <label htmlFor="appointment-edit-date" className="text-sm font-semibold text-ink">
                Scheduled date
              </label>
              <input
                id="appointment-edit-date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className={cn(inputClass, 'figure-num')}
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="appointment-edit-slot" className="text-sm font-semibold text-ink">
                Scheduled time
              </label>
              <select
                id="appointment-edit-slot"
                value={scheduledSlot}
                onChange={(e) => setScheduledSlot(e.target.value as AppointmentSlot | '')}
                className={inputClass}
              >
                <option value="">Not set</option>
                {APPOINTMENT_SLOTS.map((value) => (
                  <option key={value} value={value}>
                    {APPOINTMENT_SLOT_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="appointment-edit-office" className="text-sm font-semibold text-ink">
              Handling office
            </label>
            <input
              id="appointment-edit-office"
              type="text"
              maxLength={160}
              value={assignedOffice}
              onChange={(e) => setAssignedOffice(e.target.value)}
              placeholder="Office of the Municipal Mayor"
              className={inputClass}
            />
            {suggestedOffice ? (
              <p className="flex flex-wrap items-center gap-2 text-xs leading-relaxed text-ink-subtle">
                <CircleHelp aria-hidden className="size-3.5 shrink-0" />
                Routing hint for this purpose:
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
                No default office is defined for this purpose.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
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
            <button
              type="button"
              onClick={() => void handleDelete()}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-accent-red-200 bg-surface px-4 text-sm font-semibold text-accent-red-700 transition-colors hover:border-accent-red-500 disabled:opacity-60"
            >
              <Trash2 aria-hidden className="size-4" />
              Delete request
            </button>
          </div>
        </form>

        <div className="rule-y" />

        <div>
          <h3 className="text-sm font-bold text-ink">Audit trail</h3>
          {appointment.history.length === 0 ? (
            <p className="mt-2 text-sm text-ink-subtle">No events recorded yet.</p>
          ) : (
            <ol className="mt-3 grid gap-3">
              {appointment.history.map((event, index) => (
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

function QuickAction({
  icon,
  label,
  busy,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-3 text-sm font-semibold text-ink transition-colors hover:border-brand-400 disabled:opacity-60"
    >
      {icon}
      {label}
    </button>
  );
}

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{term}</dt>
      <dd
        className="mt-1 truncate text-sm text-ink"
        title={typeof children === 'string' ? children : undefined}
      >
        {children}
      </dd>
    </div>
  );
}
