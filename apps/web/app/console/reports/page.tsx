import type { Metadata } from 'next';

import { ReportsBrowser } from '@/components/console/reports-browser';
import { Eyebrow } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Console — reports',
  robots: { index: false, follow: false },
};

export default function ConsoleReportsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Eyebrow>Triage queue</Eyebrow>
        <h1 className="mt-1.5 text-2xl font-bold text-ink sm:text-3xl">Citizen reports</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-support">
          Filter by status, category or barangay, then open a report to update its status, priority,
          assigned office and resolution note. Every change is appended to the report history and is
          visible to the resident on the public lookup screen.
        </p>
      </header>
      <ReportsBrowser />
    </div>
  );
}
