import type { Metadata } from 'next';

import { ConsoleDashboard } from '@/components/console/dashboard';
import { Eyebrow } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Console — overview',
  robots: { index: false, follow: false },
};

export default function ConsoleHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Eyebrow>Citizen reporting</Eyebrow>
        <h1 className="mt-1.5 text-2xl font-bold text-ink sm:text-3xl">Reporting overview</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-support">
          Everything sent through the public reporting form. These figures come from the reporting
          database only — no public page depends on them.
        </p>
      </header>
      <ConsoleDashboard />
    </div>
  );
}
