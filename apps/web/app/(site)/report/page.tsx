import type { Metadata } from 'next';
import Link from 'next/link';
import { ClipboardList, Inbox, Search } from 'lucide-react';

import { SectionHeading } from '@/components/ui/primitives';
import { EmergencyBanner } from '@/components/report/emergency-banner';
import { ReportForm } from '@/components/report/report-form';
import { REPORT_CATEGORIES, REPORT_CATEGORY_LABELS } from '@betterlabo/shared';

export const metadata: Metadata = {
  title: 'Report an issue',
  description:
    'Report drainage, roads, waste, water, streetlights, disaster, health, education, agriculture or social-welfare issues in any barangay of Labo, Camarines Norte.',
};

const STEPS = [
  'You send the report and receive a reference code such as LB-2026-000042.',
  'It is screened and routed to the office that handles that category.',
  'The status moves from Received to Acknowledged, then In progress.',
  'When the work is done the report is marked Resolved, with a note.',
];

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

  const barangayParam = first(params.barangay).trim();
  const categoryParam = first(params.category).trim();

  const defaultBarangay = /^\d{10}$/.test(barangayParam) ? barangayParam : '';
  const defaultCategory = (REPORT_CATEGORIES as readonly string[]).includes(categoryParam)
    ? categoryParam
    : '';

  return (
    <div className="container-page py-10 sm:py-12">
      <SectionHeading
        eyebrow="Participation"
        title="Report an issue in your barangay"
        description="Drainage, roads, waste, water, streetlights, disaster response, health, education, agriculture and social services — for all 52 barangays of Labo."
        action={
          <Link
            href="/report/track"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand-400"
          >
            <Search aria-hidden className="size-4" />
            Track a report
          </Link>
        }
      />

      <EmergencyBanner className="mt-6" />

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <ReportForm defaultBarangay={defaultBarangay} defaultCategory={defaultCategory} />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <section className="card p-5">
            <h2 className="flex items-center gap-2 text-base font-bold text-ink">
              <ClipboardList aria-hidden className="size-5 text-brand-700" />
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
              <Inbox aria-hidden className="size-5 text-brand-700" />
              What you can report
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {REPORT_CATEGORIES.map((category) => (
                <li
                  key={category}
                  className="rounded-pill border border-rule-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink-support"
                >
                  {REPORT_CATEGORY_LABELS[category]}
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5">
            <h2 className="text-base font-bold text-ink">Your details</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              Reporting is anonymous by default. Your name and contact details are optional, are
              never published, and are shown only to the municipal staff handling the report.
            </p>
          </section>

          <section className="rounded-card border border-rule bg-surface-sunken p-5">
            <h2 className="text-base font-bold text-ink">Already sent one?</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              Use the reference code on your report to check its current status.
            </p>
            <Link
              href="/report/track"
              className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 underline"
            >
              Track a report
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
