import type { Metadata } from 'next';

import { AuthGate } from '@/components/console/auth-gate';

/**
 * The operator console.
 *
 * It sits OUTSIDE the `(site)` route group on purpose, so the public masthead,
 * footer and print chrome never appear on an internal screen — the shell is
 * supplied by `AuthGate` once the session is confirmed.
 */
export const metadata: Metadata = {
  title: 'Console',
  description: 'Internal triage console for the Municipality of Labo citizen reports.',
  robots: { index: false, follow: false },
};

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AuthGate>{children}</AuthGate>;
}
