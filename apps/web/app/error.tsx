'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * A page-level error boundary. It deliberately does not pretend the page worked:
 * a resident who hits this needs to know the figure they were about to read may
 * not have rendered, and to be given a way to report it.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the browser console for a bug report; there is no telemetry.
    console.error('BetterLabo page error', error);
  }, [error]);

  return (
    <main className="grid min-h-dvh place-items-center bg-surface-sunken px-4">
      <div className="card w-full max-w-xl p-8">
        <p className="eyebrow">Something broke</p>
        <h1 className="mt-2 text-2xl font-bold text-ink">This page could not be rendered</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-support">
          No data was changed. If you were reading a figure, reload and check it against the source
          linked on the page before relying on it.
        </p>
        {error.digest ? (
          <p className="mt-3 text-xs text-ink-subtle">
            Reference for a bug report: <span className="figure-num">{error.digest}</span>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded-md bg-brand-900 px-4 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-md border border-rule-strong px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
          >
            Back to the overview
          </Link>
        </div>
      </div>
    </main>
  );
}
