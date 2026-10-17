'use client';

import { useState } from 'react';
import { AlertCircle, Loader2, Search } from 'lucide-react';

import {
  APPOINTMENT_PURPOSE_LABELS,
  APPOINTMENT_SLOT_LABELS,
  formatDate,
  formatDateTime,
  lookupAppointmentSchema,
  type PublicAppointment,
} from '@betterlabo/shared';

import { apiGet, describeError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { AppointmentStatusBadge } from './status-badge';

/**
 * The appointment lookup screen. There are no accounts, so the reference code IS
 * the credential — hence the uppercase normalisation and the exact-shape check
 * before a request is made.
 *
 * The API never returns the applicant's name or contact details here, and this
 * view does not pretend otherwise: what a resident can read is exactly what
 * anybody holding the code can read.
 */
export function AppointmentLookupForm({ initialCode = '' }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode.toUpperCase());
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [appointment, setAppointment] = useState<PublicAppointment | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setAppointment(null);

    const parsed = lookupAppointmentSchema.safeParse({ referenceCode: code });
    if (!parsed.success) {
      setFieldError(
        parsed.error.issues[0]?.message ?? 'Enter the reference code exactly as it was given.',
      );
      return;
    }

    setFieldError(null);
    setLoading(true);
    try {
      const res = await apiGet<{ item: PublicAppointment }>(
        `/api/appointments/lookup?referenceCode=${encodeURIComponent(parsed.data.referenceCode)}`,
      );
      setAppointment(res.item);
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
          <label htmlFor="appointment-lookup-reference" className="text-sm font-semibold text-ink">
            Reference code
          </label>
          <p
            id="appointment-lookup-reference-hint"
            className="text-xs leading-relaxed text-ink-subtle"
          >
            It looks like <span className="figure-num">APT-2026-000001</span> and was shown when the
            request was sent.
          </p>
          <input
            id="appointment-lookup-reference"
            name="referenceCode"
            type="text"
            required
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={20}
            placeholder="APT-2026-000001"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={
              fieldError ? 'appointment-lookup-reference-error' : 'appointment-lookup-reference-hint'
            }
            className={cn(
              'figure-num w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3.5 py-3 text-base tracking-wide text-ink transition-colors placeholder:text-ink-subtle focus:border-brand-600',
              fieldError && 'border-accent-red-500',
            )}
          />
          {fieldError ? (
            <p
              id="appointment-lookup-reference-error"
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
          {loading ? 'Looking up…' : 'Look up request'}
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

      {appointment ? <AppointmentResult appointment={appointment} /> : null}
    </div>
  );
}

function AppointmentResult({ appointment }: { appointment: PublicAppointment }) {
  const confirmed = appointment.scheduledDate !== null;

  return (
    <article className="card p-5 sm:p-6" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Reference</p>
          <p className="figure-num text-xl font-bold tracking-tight text-ink">
            {appointment.referenceCode}
          </p>
        </div>
        <AppointmentStatusBadge status={appointment.status} />
      </div>

      <h2 className="mt-4 text-lg font-bold text-ink">
        {APPOINTMENT_PURPOSE_LABELS[appointment.purpose]}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-support">{appointment.barangayName}</p>

      <div
        className={cn(
          'mt-4 rounded-lg border p-4',
          confirmed
            ? 'border-accent-green-200 bg-accent-green-50'
            : 'border-accent-orange-200 bg-accent-orange-50',
        )}
      >
        <p className={cn('eyebrow', confirmed ? 'text-accent-green-700' : 'text-accent-orange-700')}>
          {confirmed ? 'Confirmed slot' : 'Not confirmed yet'}
        </p>
        {confirmed ? (
          <p className="mt-1.5 text-sm leading-relaxed font-semibold text-accent-green-700">
            <span className="figure-num">{appointment.scheduledDate}</span>
            {appointment.scheduledSlot
              ? ` · ${APPOINTMENT_SLOT_LABELS[appointment.scheduledSlot]}`
              : ''}
          </p>
        ) : (
          <p className="mt-1.5 text-sm leading-relaxed text-accent-orange-700">
            This is still a request. The office has not set a slot yet — it will confirm or offer
            another date.
          </p>
        )}
      </div>

      <dl className="mt-5 grid gap-3 border-t border-rule pt-4 sm:grid-cols-2">
        <div>
          <dt className="eyebrow">You asked for</dt>
          <dd className="mt-1 text-sm text-ink">
            <span className="figure-num">{appointment.preferredDate}</span> ·{' '}
            {APPOINTMENT_SLOT_LABELS[appointment.preferredSlot]}
          </dd>
        </div>
        <div>
          <dt className="eyebrow">Office handling it</dt>
          <dd className="mt-1 text-sm text-ink">{appointment.assignedOffice ?? 'Not routed yet'}</dd>
        </div>
        <div>
          <dt className="eyebrow">Requested</dt>
          <dd className="mt-1 text-sm text-ink">{formatDateTime(appointment.createdAt)}</dd>
        </div>
        <div>
          <dt className="eyebrow">Last update</dt>
          <dd className="mt-1 text-sm text-ink">{formatDateTime(appointment.updatedAt)}</dd>
        </div>
      </dl>

      {appointment.notes ? (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="eyebrow">Your note</p>
          <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-line text-ink">
            {appointment.notes}
          </p>
        </div>
      ) : null}

      {appointment.history.length > 0 ? (
        <div className="mt-5 border-t border-rule pt-4">
          <p className="eyebrow">Progress</p>
          <ol className="mt-3 grid gap-3">
            {appointment.history.map((event, index) => (
              <li key={`${event.at}-${index}`} className="flex gap-3">
                <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-600" />
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
        For privacy this view never shows the applicant’s name or contact details. The request was
        filed on {formatDate(appointment.createdAt)}.
      </p>
    </article>
  );
}
