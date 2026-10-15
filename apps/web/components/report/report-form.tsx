'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Crosshair,
  Info,
  Loader2,
  MapPin,
  Send,
} from 'lucide-react';

import {
  createReportSchema,
  REPORT_CATEGORIES,
  REPORT_CATEGORY_LABELS,
  REPORT_LIMITS,
  type Report,
} from '@betterlabo/shared';

import { ApiError, apiPost, describeError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { BarangayOptions, useBarangays } from './barangays';
import { TurnstileWidget } from './turnstile-widget';

/**
 * The citizen intake form.
 *
 * Everything is validated in the browser with the SAME `createReportSchema` the
 * API validates with, so the error copy a resident reads is the error the
 * server would have produced. The schema transforms empty strings to nulls and
 * defaults `contactConsent`, so what is sent is `result.data` — never the raw
 * form state.
 */

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

interface FormValues {
  category: string;
  barangayPsgc: string;
  subject: string;
  details: string;
  locationLabel: string;
  reporterName: string;
  reporterContact: string;
}

const FIELD_IDS: Record<keyof FormValues, string> = {
  category: 'report-category',
  barangayPsgc: 'report-barangay',
  subject: 'report-subject',
  details: 'report-details',
  locationLabel: 'report-location-label',
  reporterName: 'report-reporter-name',
  reporterContact: 'report-reporter-contact',
};

const inputClass =
  'w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3.5 py-3 text-base text-ink shadow-card transition-colors placeholder:text-ink-subtle hover:border-gray-400 focus:border-brand-600';

const invalid = (hasError: boolean) => (hasError ? 'border-accent-red-500' : undefined);

export function ReportForm({
  defaultBarangay = '',
  defaultCategory = '',
}: {
  defaultBarangay?: string;
  defaultCategory?: string;
}) {
  const { barangays, status: barangayStatus } = useBarangays();

  const [values, setValues] = useState<FormValues>({
    category: defaultCategory,
    barangayPsgc: defaultBarangay,
    subject: '',
    details: '',
    locationLabel: '',
    reporterName: '',
    reporterContact: '',
  });
  const [contactKind, setContactKind] = useState<'email' | 'phone'>('email');
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  const [errors, setErrors] = useState<Partial<Record<keyof FormValues, string>>>({});
  const [summary, setSummary] = useState<Array<{ id: string; message: string }>>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Report | null>(null);
  const [copied, setCopied] = useState(false);

  const summaryRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Move focus to the error summary the moment one is rendered.
  useEffect(() => {
    if (summary.length > 0) summaryRef.current?.focus();
  }, [summary]);

  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  function captureLocation() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoStatus('error');
      return;
    }
    setGeoStatus('loading');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          lat: Number(position.coords.latitude.toFixed(6)),
          lng: Number(position.coords.longitude.toFixed(6)),
        });
        setGeoStatus('idle');
      },
      () => setGeoStatus('error'),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);

    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setSubmitError('Please complete the verification check before sending your report.');
      return;
    }

    const payload = {
      category: values.category,
      barangayPsgc: values.barangayPsgc,
      subject: values.subject,
      details: values.details,
      locationLabel: values.locationLabel,
      location,
      reporterName: values.reporterName,
      reporterContact: values.reporterContact,
      contactConsent: consent,
      turnstileToken,
      website: honeypot,
    };

    const parsed = createReportSchema.safeParse(payload);
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
      const res = await apiPost<{ item: Report }>('/api/reports', parsed.data);
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
      category: '',
      barangayPsgc: '',
      subject: '',
      details: '',
      locationLabel: '',
      reporterName: '',
      reporterContact: '',
    });
    setConsent(false);
    setLocation(null);
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
    return <SubmitSuccess report={result} copied={copied} onCopy={copyCode} onReset={startOver} />;
  }

  const detailsLength = values.details.length;
  const detailsTooShort = detailsLength > 0 && detailsLength < REPORT_LIMITS.minDetails;

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-6"
      aria-describedby={submitError ? 'report-submit-error' : undefined}
    >
      {summary.length > 0 ? (
        <div
          ref={summaryRef}
          tabIndex={-1}
          role="alert"
          aria-labelledby="report-error-summary-title"
          className="rounded-card border border-accent-red-200 bg-accent-red-50 p-4 sm:p-5"
        >
          <h2 id="report-error-summary-title" className="text-base font-bold text-accent-red-700">
            There {summary.length === 1 ? 'is 1 problem' : `are ${summary.length} problems`} with
            your report
          </h2>
          <ul className="mt-2 grid gap-1.5">
            {summary.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  className="text-sm font-semibold text-accent-red-700 underline"
                >
                  {item.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {submitError ? (
        <div
          id="report-submit-error"
          role="alert"
          className="flex items-start gap-3 rounded-card border border-accent-red-200 bg-accent-red-50 p-4"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-red-700" />
          <p className="text-sm leading-relaxed font-semibold text-accent-red-700">{submitError}</p>
        </div>
      ) : null}

      {/* ── What it is about ─────────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="eyebrow mb-1">The issue</legend>

        <Field
          id="report-category"
          label="What kind of issue is it?"
          required
          error={errors.category}
        >
          <select
            id="report-category"
            name="category"
            required
            value={values.category}
            onChange={(e) => set('category', e.target.value)}
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={errors.category ? 'report-category-error' : undefined}
            className={cn(inputClass, invalid(Boolean(errors.category)))}
          >
            <option value="">Choose a category…</option>
            {REPORT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {REPORT_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="report-barangay"
          label="Which barangay is it in?"
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
              id="report-barangay"
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
                errors.barangayPsgc ? 'report-barangay-error' : 'report-barangay-hint'
              }
              className={cn(inputClass, 'figure-num', invalid(Boolean(errors.barangayPsgc)))}
            />
          ) : (
            <select
              id="report-barangay"
              name="barangayPsgc"
              required
              value={values.barangayPsgc}
              disabled={barangayStatus === 'loading'}
              onChange={(e) => set('barangayPsgc', e.target.value)}
              aria-invalid={errors.barangayPsgc ? true : undefined}
              aria-describedby={errors.barangayPsgc ? 'report-barangay-error' : undefined}
              className={cn(inputClass, invalid(Boolean(errors.barangayPsgc)))}
            >
              <option value="">
                {barangayStatus === 'loading' ? 'Loading barangays…' : 'Choose a barangay…'}
              </option>
              <BarangayOptions barangays={barangays} />
            </select>
          )}
        </Field>

        <Field
          id="report-subject"
          label="Short title"
          required
          error={errors.subject}
          hint={`One line, up to ${REPORT_LIMITS.subjectMax} characters.`}
        >
          <input
            id="report-subject"
            name="subject"
            type="text"
            required
            maxLength={REPORT_LIMITS.subjectMax}
            placeholder="Blocked drainage canal along Rizal Street"
            value={values.subject}
            onChange={(e) => set('subject', e.target.value)}
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={
              errors.subject ? 'report-subject-error' : 'report-subject-hint'
            }
            className={cn(inputClass, invalid(Boolean(errors.subject)))}
          />
        </Field>

        <Field
          id="report-details"
          label="What is happening?"
          required
          error={errors.details}
          hint="Who is affected, since when, and anything you have already reported."
        >
          <textarea
            id="report-details"
            name="details"
            required
            rows={6}
            maxLength={REPORT_LIMITS.detailsMax}
            placeholder="Describe the problem. At least 30 characters."
            value={values.details}
            onChange={(e) => set('details', e.target.value)}
            aria-invalid={errors.details ? true : undefined}
            aria-describedby={errors.details ? 'report-details-error' : 'report-details-count'}
            className={cn(inputClass, 'min-h-32 resize-y', invalid(Boolean(errors.details)))}
          />
          <p
            id="report-details-count"
            className={cn(
              'text-xs tabular-nums',
              detailsTooShort ? 'font-semibold text-accent-orange-700' : 'text-ink-subtle',
            )}
          >
            {detailsLength} / {REPORT_LIMITS.detailsMax} characters
            {detailsTooShort ? ` · ${REPORT_LIMITS.minDetails - detailsLength} more needed` : ''}
          </p>
        </Field>
      </fieldset>

      <div className="rule-y" />

      {/* ── Where ────────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="eyebrow mb-1">Where exactly</legend>

        <Field
          id="report-location-label"
          label="Landmark or address"
          required
          error={errors.locationLabel}
          hint="A purok, street, bridge or building name is enough — no GPS needed."
        >
          <input
            id="report-location-label"
            name="locationLabel"
            type="text"
            required
            maxLength={REPORT_LIMITS.locationLabelMax}
            placeholder="Purok 3, near the covered court"
            value={values.locationLabel}
            onChange={(e) => set('locationLabel', e.target.value)}
            aria-invalid={errors.locationLabel ? true : undefined}
            aria-describedby={
              errors.locationLabel ? 'report-location-label-error' : 'report-location-label-hint'
            }
            className={cn(inputClass, invalid(Boolean(errors.locationLabel)))}
          />
        </Field>

        <div className="rounded-lg border border-rule bg-surface-sunken p-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={captureLocation}
              disabled={geoStatus === 'loading'}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400 disabled:opacity-60"
            >
              {geoStatus === 'loading' ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Crosshair aria-hidden className="size-4" />
              )}
              Use my current location
            </button>
            {location ? (
              <span className="figure-num inline-flex items-center gap-1.5 text-xs text-ink-support">
                <MapPin aria-hidden className="size-3.5" />
                {location.lat}, {location.lng}
                <button
                  type="button"
                  onClick={() => setLocation(null)}
                  className="font-semibold text-brand-700 underline"
                >
                  Clear
                </button>
              </span>
            ) : (
              <span className="text-xs text-ink-subtle">Optional</span>
            )}
          </div>
          {geoStatus === 'error' ? (
            <p role="status" className="mt-2 text-xs font-semibold text-accent-orange-700">
              We could not read your location. The landmark above is enough.
            </p>
          ) : null}
        </div>
      </fieldset>

      <div className="rule-y" />

      {/* ── Who ──────────────────────────────────────────────────────────── */}
      <fieldset className="grid gap-5">
        <legend className="eyebrow mb-1">Contact (optional)</legend>
        <p className="-mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-subtle">
          <Info aria-hidden className="mt-px size-3.5 shrink-0" />
          Your name and contact are never shown publicly. Give them only if you want the office to
          be able to follow up.
        </p>

        <Field id="report-reporter-name" label="Your name" error={errors.reporterName}>
          <input
            id="report-reporter-name"
            name="reporterName"
            type="text"
            maxLength={REPORT_LIMITS.reporterNameMax}
            autoComplete="name"
            value={values.reporterName}
            onChange={(e) => set('reporterName', e.target.value)}
            aria-invalid={errors.reporterName ? true : undefined}
            aria-describedby={errors.reporterName ? 'report-reporter-name-error' : undefined}
            className={cn(inputClass, invalid(Boolean(errors.reporterName)))}
          />
        </Field>

        <Field
          id="report-reporter-contact"
          label="How can we reach you?"
          error={errors.reporterContact}
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
              id="report-reporter-contact"
              name="reporterContact"
              type="text"
              inputMode={contactKind === 'phone' ? 'tel' : 'email'}
              autoComplete={contactKind === 'phone' ? 'tel' : 'email'}
              maxLength={REPORT_LIMITS.reporterContactMax}
              placeholder={contactKind === 'phone' ? '0917 000 0000' : 'you@example.com'}
              value={values.reporterContact}
              onChange={(e) => set('reporterContact', e.target.value)}
              aria-invalid={errors.reporterContact ? true : undefined}
              aria-describedby={
                errors.reporterContact ? 'report-reporter-contact-error' : undefined
              }
              className={cn(inputClass, invalid(Boolean(errors.reporterContact)))}
            />
          </div>
        </Field>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-rule bg-surface p-3.5">
          <input
            type="checkbox"
            name="contactConsent"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded border-rule-strong accent-brand-900"
          />
          <span className="text-sm leading-relaxed text-ink-support">
            You may contact me about this report. I understand my contact details stay private and
            are used only to follow up.
          </span>
        </label>
      </fieldset>

      {/* Honeypot: off-screen, never focusable, expected to stay empty. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px' }}>
        <label htmlFor="report-website">Leave this field empty</label>
        <input
          id="report-website"
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
          {submitting ? 'Sending…' : 'Send report'}
        </button>
        <p className="text-xs leading-relaxed text-ink-subtle">
          You will get a reference code to track progress. Screening happens on office days, not
          immediately.
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

function SubmitSuccess({
  report,
  copied,
  onCopy,
  onReset,
}: {
  report: Report;
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
            <p className="eyebrow text-accent-green-700">Sent</p>
            <h2 className="text-xl font-bold text-ink">Your report was received</h2>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-support">
          Keep this reference code. It is the only way to look the report up — there is no account
          and no email confirmation.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-rule bg-surface-sunken p-4">
          <output className="figure-num text-2xl font-bold tracking-tight text-ink">
            {report.referenceCode}
          </output>
          <button
            type="button"
            onClick={() => onCopy(report.referenceCode)}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
          >
            <Copy aria-hidden className="size-4" />
            {copied ? 'Copied' : 'Copy code'}
          </button>
        </div>

        <dl className="mt-6 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="eyebrow">Barangay</dt>
            <dd className="mt-1 text-sm text-ink">{report.barangayName}</dd>
          </div>
          <div>
            <dt className="eyebrow">Office</dt>
            <dd className="mt-1 text-sm text-ink">
              {report.assignedOffice ?? 'Not routed yet'}
            </dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/report/track?referenceCode=${encodeURIComponent(report.referenceCode)}`}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-900 px-5 text-base font-semibold text-brand-50 transition-colors hover:bg-brand-800"
          >
            Track this report
          </Link>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-12 items-center justify-center rounded-lg border border-rule-strong bg-surface px-5 text-base font-semibold text-ink transition-colors hover:border-brand-400"
          >
            Send another report
          </button>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-ink-subtle">
        Screening happens on office days. If the issue is urgent, follow up with the municipal
        office directly.
      </p>
    </div>
  );
}
