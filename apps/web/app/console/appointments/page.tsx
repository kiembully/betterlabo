import type { Metadata } from 'next';

import { AppointmentsBrowser } from '@/components/console/appointments-browser';
import { Eyebrow } from '@/components/ui/primitives';

export const metadata: Metadata = {
  title: 'Console — appointments',
  robots: { index: false, follow: false },
};

export default function ConsoleAppointmentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Eyebrow>Appointment queue</Eyebrow>
        <h1 className="mt-1.5 text-2xl font-bold text-ink sm:text-3xl">Appointment requests</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-support">
          Filter by status or requested date, then open a request to see the applicant’s contact
          details and set the real slot. Confirming, rescheduling, completing, cancelling or marking
          a no-show is appended to the audit trail and is visible to the resident on the public
          tracker.
        </p>
      </header>
      <AppointmentsBrowser />
    </div>
  );
}
