'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, CalendarDays, CheckCircle2, Copy, Info, Loader2, Send } from 'lucide-react';

import {
  APPOINTMENT_LIMITS,
  APPOINTMENT_PURPOSES,
  APPOINTMENT_PURPOSE_LABELS,
  APPOINTMENT_SLOTS,
  APPOINTMENT_SLOT_LABELS,
  createAppointmentSchema,
  manilaToday,
  type PublicAppointment,
} from '@betterlabo/shared';

import { BarangayOptions, useBarangays } from '@/components/report/barangays';
import { TurnstileWidget } from '@/components/report/turnstile-widget';
import { ApiError, apiPost, describeError } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * The public appointment request form.
 *
 * Everything is validated in the browser with the SAME `createAppointmentSchema`
 * the API validates with, so the error copy a resident reads is the error the
 * server would have produced. The schema trims empty strings to nulls, so what
 * is sent is `result.data` — never the raw form state.
 *
 * The form promises a *request*: the confirmation panel says so in as many
 * words, because the slot is not held until the office confirms it.
 */

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

interface FormValues {
  fullName: string;
  contact: string;
  barangayPsgc: string;
  purpose: string;
  preferredDate: string;
  preferredSlot: string;
  notes: string;
}

const FIELD_IDS: Record<keyof FormValues, string> = {
  fullName: 'appointment-full-name',
  contact: 'appointment-contact',
  barangayPsgc: 'appointment-barangay',
  purpose: 'appointment-purpose',
  preferredDate: 'appointment-date',
  preferredSlot: 'appointment-slot',
  notes: 'appointment-notes',
};

const inputClass =
  'w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3.5 py-3 text-base text-ink shadow-card transition-colors placeholder:text-ink-subtle hover:border-gray-400 focus:border-brand-600';

const invalid = (hasError: boolean) => (hasError ? 'border-accent-red-500' : undefined);

export function AppointmentForm({ defaultPurpose = '' }: { defaultPurpose?: string }) {
  const { barangays, status: barangayStatus } = useBarangays();

  const [values, setValues] = useState<FormValues>({
    fullName: '',
    contact: '',
    barangayPsgc: '',
    purpose: defaultPurpose,
    preferredDate: '',
    preferredSlot: '',
    notes: '',
  });
  const [contactKind, setContactKind] = useState<'email' | 'phone'>('email');
  const [honeypot, setHoneypot] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [summary, setSummary] = useState<Array<{ id: string; message: string }>>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PublicAppointment | null>(null);
  const [copied, setCopied] = useState(false);

  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Move focus to the error summary the moment one is rendered.
  useEffect(() => {
    if (summary.length > 0) summaryRef.current?.focus();
  }, [summary]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const today = manilaToday();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setSubmitError('Please complete the verification check before sending your request.');
      return;
    }

    const payload = {
      fullName: values.fullName,
      contact: values.contact,
      barangayPsgc: values.barangayPsgc,
      purpose: values.purpose,
      preferredDate: values.preferredDate,
      preferredSlot: values.preferredSlot,
      notes: values.notes,
      turnstileToken,
      website: honeypot,
    };

    const parsed = createAppointmentSchema.safeParse(payload);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof FormValues, string>> = {};
      const nextSummary: Array<{ id: string; message: string }> = [];
      let botBlocked = false;

      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '');
        if (key === 'website') {
          botBlocked = true;
          continue;
        }
        const id = FIELD_IDS[key as keyof FormValues];
        if (!id) continue;
        if (!nextErrors[key as keyof FormValues]) {
          nextErrors[key as keyof FormValues] = issue.message;
          nextSummary.push({ id, message: issue.message });
        }
      }

      setErrors(nextErrors);
      setSummary(nextSummary);
      setSubmitError(
        botBlocked
          ? 'This submission was blocked by the spam filter. Please reload the page and try again.'
          : null,
      );
      return;
    }

    setErrors({});
    setSummary([]);
    setSubmitting(true);

    try {
      const res = await apiPost<{ item: PublicAppointment }>('/api/appointments', parsed.data);
      setResult(res.item);
      setCopied(false);
      formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (err) {
      setSubmitError(describeError(err));
      if (err instanceof ApiError && err.code === 'captcha_failed') setTurnstileToken(null);
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setResult(null);
    setValues({
      fullName: '',
      contact: '',
      barangayPsgc: '',
      purpose: '',
      preferredDate: '',
      preferredSlot: '',
      notes: '',
    });
    setTurnstileToken(null);
    setErrors({});
    setSummary([]);
    setSubmitError(null);
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (result) {
    return <RequestSuccess appointment={result} copied={copied} onCopy={copyCode} onReset={startOver} />;
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-6"
      aria-describedby={submitError ? 'appointment-submit-error' : undefined}
    >
      {summary.length > 0 ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="appointment-error-summary-title"
          className="rounded-card border border-accent-red-200 bg-accent-red-50 p-4 sm:p-5"
        >
          <h2
            id="appointment-error-summary-title"
            className="text-base font-bold text-accent-red-700"
          >
            There {summary.length === 1 ? 'is 1 problem' : `are ${summary.length} problems`} with
            your request
          </h2>
          <ul className="mt-2 grid gap-1.5">
            {summary.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="text-sm font-semibold text-accent-red-700 underline">
                  {item.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitError ? (
        <div
          id="appointment-submit-error"
          role="alert"
          className="flex items-start gap-3 rounded-card border border-accent-red-200 bg-accent-red-50 p-4"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-red-700" />
          <p className="text-sm leading-relaxed font-semibold text-accent-red-700">{submitError}</p>
        </div>
      ) : null}

      {/* ── Who ──────────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="eyebrow mb-1">Who is booking</legend>

        <Field id="appointment-full-name" label="Full name" required error={errors.fullName}>
          <input
            id="appointment-full-name"
            name="fullName"
            type="text"
            required
            maxLength={APPOINTMENT_LIMITS.fullNameMax}
            autoComplete="name"
            placeholder="Juan D. Dela Cruz"
            value={values.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            aria-invalid={errors.fullName ? true : undefined}
            aria-describedby={errors.fullName ? 'appointment-full-name-error' : undefined}
            className={cn(inputClass, invalid(Boolean(errors.fullName)))}
          />
        </Field>

        <Field
          id="appointment-contact"
          label="How can we reach you?"
          required
          error={errors.contact}
          hint="Either an email address or a Philippine mobile number — the office uses it to confirm your slot."
        >
          <div className="flex flex-col gap-3">
            <div
              role="radiogroup"
              aria-label="Contact method"
              className="inline-flex w-fit rounded-lg border border-rule-strong bg-surface p-0.5"
            >
              {(['email', 'phone'] as const).map((kind) => (
                <label
                  key={kind}
                  className={cn(
                    'cursor-pointer rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                    contactKind === kind
                      ? 'bg-brand-900 text-brand-50'
                      : 'text-ink-support hover:text-ink',
                  )}
                >
                  <input
                    type="radio"
                    name="contactKind"
                    value={kind}
                    checked={contactKind === kind}
                    onChange={() => setContactKind(kind)}
                    className="peer sr-only"
                  />
                  <span className="peer-focus-visible:underline">
                    {kind === 'email' ? 'Email' : 'Mobile number'}
                  </span>
                </label>
              ))}
            </div>
            <input
              id="appointment-contact"
              name="contact"
              type="text"
              required
              inputMode={contactKind === 'phone' ? 'tel' : 'email'}
              autoComplete={contactKind === 'phone' ? 'tel' : 'email'}
              maxLength={APPOINTMENT_LIMITS.contactMax}
              placeholder={contactKind === 'phone' ? '0917 000 0000' : 'you@example.com'}
              value={values.contact}
              onChange={(e) => set('contact', e.target.value)}
              aria-invalid={errors.contact ? true : undefined}
              aria-describedby={
                errors.contact ? 'appointment-contact-error' : 'appointment-contact-hint'
              }
              className={cn(inputClass, invalid(Boolean(errors.contact)))}
            />
          </div>
        </Field>

        <Field
          id="appointment-barangay"
          label="Your barangay"
          required
          error={errors.barangayPsgc}
          hint={
            barangayStatus === 'failed'
              ? 'The barangay list could not be loaded, so type the 10-digit PSGC code instead.'
              : undefined
          }
        >
          {barangayStatus === 'failed' ? (
            <input
              id="appointment-barangay"
              name="barangayPsgc"
              required
              inputMode="numeric"
              pattern="\d{10}"
              maxLength={10}
              placeholder="e.g. 0501606012"
              value={values.barangayPsgc}
              onChange={(e) => set('barangayPsgc', e.target.value.replace(/\D/g, ''))}
              aria-invalid={errors.barangayPsgc ? true : undefined}
              aria-describedby={
                errors.barangayPsgc ? 'appointment-barangay-error' : 'appointment-barangay-hint'
              }
              className={cn(inputClass, 'figure-num', invalid(Boolean(errors.barangayPsgc)))}
            />
          ) : (
            <select
              id="appointment-barangay"
              name="barangayPsgc"
              required
              value={values.barangayPsgc}
              disabled={barangayStatus === 'loading'}
              onChange={(e) => set('barangayPsgc', e.target.value)}
              aria-invalid={errors.barangayPsgc ? true : undefined}
              aria-describedby={errors.barangayPsgc ? 'appointment-barangay-error' : undefined}
              className={cn(inputClass, invalid(Boolean(errors.barangayPsgc)))}
            >
              <option value="">
                {barangayStatus === 'loading' ? 'Loading barangays…' : 'Choose a barangay…'}
              </option>
              <BarangayOptions barangays={barangays} />
            </select>
          )}
        </Field>
      </fieldset>

      <div className="rule-y" />

      {/* ── What for ─────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="eyebrow mb-1">What you need</legend>

        <Field
          id="appointment-purpose"
          label="Which office do you need?"
          required
          error={errors.purpose}
        >
          <select
            id="appointment-purpose"
            name="purpose"
            required
            value={values.purpose}
            onChange={(e) => set('purpose', e.target.value)}
            aria-invalid={errors.purpose ? true : undefined}
            aria-describedby={errors.purpose ? 'appointment-purpose-error' : undefined}
            className={cn(inputClass, invalid(Boolean(errors.purpose)))}
          >
            <option value="">Choose a service…</option>
            {APPOINTMENT_PURPOSES.map((purpose) => (
              <option key={purpose} value={purpose}>
                {APPOINTMENT_PURPOSE_LABELS[purpose]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="appointment-notes"
          label="Anything the office should know"
          error={errors.notes}
        >
          <textarea
            id="appointment-notes"
            name="notes"
            rows={4}
            maxLength={APPOINTMENT_LIMITS.notesMax}
            placeholder="For example: I am renewing a business permit and will bring last year’s receipt."
            value={values.notes}
            onChange={(e) => set('notes', e.target.value)}
            aria-invalid={errors.notes ? true : undefined}
            aria-describedby={errors.notes ? 'appointment-notes-error' : undefined}
            className={cn(inputClass, 'min-h-24 resize-y', invalid(Boolean(errors.notes)))}
          />
        </Field>
      </fieldset>

      <div className="rule-y" />

      {/* ── When ─────────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="eyebrow mb-1">When you would like to come</legend>

        <Field
          id="appointment-date"
          label="Preferred date"
          required
          error={errors.preferredDate}
          hint="Mondays to Fridays only — the municipal hall is closed at weekends."
        >
          <input
            id="appointment-date"
            name="preferredDate"
            type="date"
            required
            min={today}
            value={values.preferredDate}
            onChange={(e) => set('preferredDate', e.target.value)}
            aria-invalid={errors.preferredDate ? true : undefined}
            aria-describedby={
              errors.preferredDate ? 'appointment-date-error' : 'appointment-date-hint'
            }
            className={cn(inputClass, 'figure-num', invalid(Boolean(errors.preferredDate)))}
          />
        </Field>

        <Field
          id="appointment-slot"
          label="Preferred time"
          required
          error={errors.preferredSlot}
        >
          <select
            id="appointment-slot"
            name="preferredSlot"
            required
            value={values.preferredSlot}
            onChange={(e) => set('preferredSlot', e.target.value)}
            aria-invalid={errors.preferredSlot ? true : undefined}
            aria-describedby={errors.preferredSlot ? 'appointment-slot-error' : undefined}
            className={cn(inputClass, invalid(Boolean(errors.preferredSlot)))}
          >
            <option value="">Choose a time…</option>
            {APPOINTMENT_SLOTS.map((slot) => (
              <option key={slot} value={slot}>
                {APPOINTMENT_SLOT_LABELS[slot]}
              </option>
            ))}
          </select>
        </Field>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-ink-subtle">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          The date and time you choose are what you are asking for. The office confirms the actual
          slot — nothing is held until you are told it is.
        </p>
      </fieldset>

      {/* Honeypot: off-screen, never focusable, expected to stay empty. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="appointment-website">Leave this field empty</label>
        <input
          id="appointment-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      <TurnstileWidget siteKey={TURNSTILE_SITE_KEY} onToken={setTurnstileToken} />

      <div className="flex flex-col gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-brand-900 px-5 text-base font-semibold text-brand-50 transition-colors hover:bg-brand-800 disabled:opacity-60 sm:w-auto"
        >
          {submitting ? (
            <Loader2 aria-hidden className="size-5 animate-spin" />
          ) : (
            <Send aria-hidden className="size-5" />
          )}
          {submitting ? 'Sending…' : 'Request this slot'}
        </button>
        <p className="text-xs leading-relaxed text-ink-subtle">
          You will get a reference code to check the status. Confirmation happens on office days,
          not immediately.
        </p>
      </div>
    </form>
  );
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-accent-red-600" aria-hidden>
            *
          </span>
        ) : (
          <span className="ml-1 text-xs font-normal text-ink-subtle">(optional)</span>
        )}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p
          id={`${id}-error`}
          className="flex items-start gap-1.5 text-xs font-semibold text-accent-red-700"
        >
          <AlertCircle aria-hidden className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}

function RequestSuccess({
  appointment,
  copied,
  onCopy,
  onReset,
}: {
  appointment: PublicAppointment;
  copied: boolean;
  onCopy: (code: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="card p-6 sm:p-8" role="status">
        <div className="flex items-center gap-3">
          <CheckCircle2 aria-hidden className="size-8 shrink-0 text-accent-green-600" />
          <div>
            <p className="eyebrow text-accent-green-700">Requested</p>
            <h2 className="text-xl font-bold text-ink">Your request was received</h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-support">
          This is a request, not a confirmed booking. The office will confirm the date and time, or
          offer another slot. Keep this reference code — it is the only way to check the request and
          there is no account.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-surface-sunken p-4">
          <output className="figure-num text-2xl font-bold tracking-tight text-ink">
            {appointment.referenceCode}
          </output>
          <button
            type="button"
            onClick={() => onCopy(appointment.referenceCode)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
          >
            <Copy aria-hidden className="size-4" />
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">You asked for</dt>
            <dd className="mt-1 text-sm text-ink">
              <span className="figure-num">{appointment.preferredDate}</span> ·{' '}
              {APPOINTMENT_SLOT_LABELS[appointment.preferredSlot]}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Likely office</dt>
            <dd className="mt-1 text-sm text-ink">
              {appointment.assignedOffice ?? 'Not routed yet'}
            </dd>
          </div>
          <div>
            <dt className="eyebrow">Barangay</dt>
            <dd className="mt-1 text-sm text-ink">{appointment.barangayName}</dd>
          </div>
          <div>
            <dt className="eyebrow">Confirmed date</dt>
            <dd className="mt-1 text-sm text-ink">
              {appointment.scheduledDate ? (
                <span className="figure-num">{appointment.scheduledDate}</span>
              ) : (
                'Not confirmed yet'
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/appointments/track?referenceCode=${encodeURIComponent(appointment.referenceCode)}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-900 px-5 text-base font-semibold text-brand-50 transition-colors hover:bg-brand-800"
          >
            Track this request
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-rule-strong bg-surface px-5 text-base font-semibold text-ink transition-colors hover:border-brand-400"
          >
            Request another slot
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-subtle">
        <CalendarDays aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
        Confirmation happens during office hours. If the date is urgent, follow up with the
        municipal office directly.
      </p>
    </div>
  );
}
