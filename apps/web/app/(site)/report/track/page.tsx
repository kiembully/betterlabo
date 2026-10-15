import type { Metadata } from 'next';
import Link from 'next/link';

import { SectionHeading } from '@/components/ui/primitives';
import { EmergencyBanner } from '@/components/report/emergency-banner';
import { LookupForm } from '@/components/report/lookup-form';

export const metadata: Metadata = {
  title: 'Track a report',
  description:
    'Look up a citizen report to the Municipality of Labo by its reference code and see its current status.',
};

export default async function TrackReportPage({
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
        eyebrow="Participation"
        title="Track a report"
        description="Enter the reference code you were given when you sent the report. No account is needed."
        action={
          <Link
            href="/report"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
          >
            Send a new report
          </Link>
        }
      />

      <div className="mt-6 max-w-2xl">
        <LookupForm initialCode={initialCode} />
      </div>

      <EmergencyBanner className="mt-8 max-w-2xl" />
    </div>
  );
}
