import type { Metadata } from 'next';
import Link from 'next/link';

import { SectionHeading } from '@/components/ui/primitives';
import { AppointmentLookupForm } from '@/components/appointments/lookup-form';

export const metadata: Metadata = {
  title: 'Track an appointment request',
  description:
    'Look up an appointment request to the Municipality of Labo by its reference code and see whether the slot has been confirmed.',
};

export default async function TrackAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.referenceCode;
  const initialCode = (Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '')).trim();

  return (
    <div className="container-page py-10 sm:py-12">
      <SectionHeading
        eyebrow="Services"
        title="Track an appointment request"
        description="Enter the reference code you were given when you asked for the slot. No account is needed."
        action={
          <Link
            href="/appointments"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
          >
            Request a new slot
          </Link>
        }
      />

      <div className="mt-6 max-w-2xl">
        <AppointmentLookupForm initialCode={initialCode} />
      </div>

      <p className="mt-8 max-w-2xl text-xs leading-relaxed text-ink-subtle">
        A code such as <span className="figure-num">APT-2026-000001</span> is the only thing needed
        to look a request up. If your code is not recognised, the request may not have been
        submitted — try sending it again, or call the municipal hall.
      </p>
    </div>
  );
}
