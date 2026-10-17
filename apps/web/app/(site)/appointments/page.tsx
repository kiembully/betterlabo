import type { Metadata } from 'next';
import Link from 'next/link';
import { CalendarClock, CalendarDays, CheckCircle2, Info, Search, XCircle } from 'lucide-react';

import { SectionHeading } from '@/components/ui/primitives';
import { AppointmentForm } from '@/components/appointments/appointment-form';
import {
  APPOINTMENT_PURPOSES,
  APPOINTMENT_PURPOSE_LABELS,
} from '@betterlabo/shared';

export const metadata: Metadata = {
  title: 'Schedule an appointment',
  description:
    'Ask the Municipality of Labo for a slot with the Mayor’s Office, business permits, civil registry, treasury, health, social welfare, agriculture, engineering or environment office.',
};

const STEPS = [
  'You send the request and receive a reference code such as APT-2026-000001.',
  'The office reads it and sets the real date and time, or offers you another slot.',
  'Once a slot is set the status becomes Confirmed and the date appears in the tracker.',
  'After your visit it is marked Completed. A slot you do not attend is marked No show.',
];

const IS_NOT = [
  'It is a request for a slot, not a confirmed booking. Nothing is held until the office confirms it.',
  'It is not a queue ticket — you still bring your documents and take a number at the counter.',
  'It is not an emergency channel. For anything urgent, call the municipal hotline or 911.',
];

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.purpose;
  const purposeParam = (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')).trim();
  const defaultPurpose = (APPOINTMENT_PURPOSES as readonly string[]).includes(purposeParam)
    ? purposeParam
    : '';

  return (
    <div className="container-page py-10 sm:py-12">
      <SectionHeading
        eyebrow="Services"
        title="Schedule an appointment"
        description="Ask for a slot with a municipal office before you travel to the municipal hall — for all 52 barangays of Labo, Camarines Norte."
        action={
          <Link
            href="/appointments/track"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
          >
            <Search aria-hidden className="size-4" />
            Track a request
          </Link>
        }
      />

      {/*
        The honesty banner. This is the one page where a resident could reasonably
        believe a slot is already theirs, so what the service is NOT is stated
        before the form, not after it.
      */}
      <section className="mt-6 rounded-card border border-brand-200 bg-brand-50 p-4 sm:p-5">
        <p className="eyebrow text-brand-900">What this is</p>
        <p className="mt-1.5 flex items-start gap-2 text-sm leading-relaxed font-semibold text-brand-900">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          A request for an appointment slot. The office confirms the date and time with you before
          it is booked.
        </p>
        <ul className="mt-3 grid gap-2">
          {IS_NOT.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-relaxed text-ink-support">
              <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-accent-red-600" />
              {line}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <AppointmentForm defaultPurpose={defaultPurpose} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <CalendarClock aria-hidden className="size-5 text-brand-700" />
              What happens next
            </h2>
            <ol className="mt-3 grid gap-3">
              {STEPS.map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span
                    aria-hidden
                    className="figure-num mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-900"
                  >
                    {index + 1}
                  </span>
                  <span className="text-sm leading-relaxed text-ink-support">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <CalendarDays aria-hidden className="size-5 text-brand-700" />
              Who you can book with
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {APPOINTMENT_PURPOSES.map((purpose) => (
                <li
                  key={purpose}
                  className="rounded-pill border border-rule-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink-support"
                >
                  {APPOINTMENT_PURPOSE_LABELS[purpose]}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
              The office shown is a routing hint. When you arrive the municipal hall will send you
              to the counter that handles your transaction.
            </p>
          </section>

          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <CheckCircle2 aria-hidden className="size-5 text-brand-700" />
              Office hours
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              Monday to Friday, morning or afternoon. The municipal hall is closed at weekends, so
              the form only accepts weekday dates.
            </p>
          </section>

          <section className="rounded-card border border-rule bg-surface-sunken p-5">
            <h2 className="text-base font-bold text-ink">Already sent one?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              Use the reference code you were given to see whether the slot has been confirmed.
            </p>
            <Link
              href="/appointments/track"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 underline"
            >
              Track a request
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
