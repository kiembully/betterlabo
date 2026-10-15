import Link from 'next/link';

export const metadata = { title: 'Not found' };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-surface-sunken px-4">
      <div className="card survey-grid w-full max-w-lg p-8 text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">
          That page is not part of this portal
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-support">
          The link may be out of date, or a barangay or section may not have been compiled yet. The
          data registry lists everything this portal actually holds.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            href="/"
            className="rounded-md bg-brand-900 px-4 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800"
          >
            Overview
          </Link>
          <Link
            href="/data"
            className="rounded-md border border-rule-strong px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
          >
            Data &amp; sources
          </Link>
          <Link
            href="/barangays"
            className="rounded-md border border-rule-strong px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
          >
            Barangays
          </Link>
        </div>
      </div>
    </main>
  );
}
