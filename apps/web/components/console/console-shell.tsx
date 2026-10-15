'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ClipboardList,
  ExternalLink,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
} from 'lucide-react';

import { cn } from '@/lib/cn';

const CONSOLE_NAV = [
  { href: '/console', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/console/reports', label: 'Reports', icon: ClipboardList },
] as const;

/**
 * The console chrome. It is intentionally NOT part of the `(site)` route group,
 * so the public masthead and footer never bleed into an operator screen.
 */
export function ConsoleShell({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void | Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isActive = (href: string) =>
    href === '/console' ? pathname === '/console' : pathname.startsWith(href);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await onSignOut();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="no-print sticky top-0 z-50 border-b border-rule bg-surface-bold">
        <div className="container-page flex h-16 items-center gap-4">
          <Link href="/console" className="flex shrink-0 items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-md bg-brand-50 font-mono text-sm font-bold text-brand-900"
            >
              BL
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight text-ink-inverse">
                BetterLabo console
              </span>
              <span className="hidden text-[0.6875rem] font-medium text-brand-100 xs:block">
                Municipality of Labo — internal
              </span>
            </span>
          </Link>

          <nav aria-label="Console" className="ml-auto hidden md:block">
            <ul className="flex items-center gap-1">
              {CONSOLE_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                      isActive(item.href)
                        ? 'bg-brand-50 text-brand-900'
                        : 'text-brand-100 hover:bg-brand-900 hover:text-ink-inverse',
                    )}
                  >
                    <item.icon aria-hidden className="size-4" />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="console-nav-mobile"
            className="ml-auto inline-flex items-center gap-2 rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-ink-inverse md:hidden"
          >
            <Menu aria-hidden className="size-4" />
            Menu
          </button>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-brand-100 transition-colors hover:text-ink-inverse"
            >
              Public site
              <ExternalLink aria-hidden className="size-3.5" />
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-brand-900 disabled:opacity-60"
            >
              {signingOut ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <LogOut aria-hidden className="size-4" />
              )}
              Sign out
            </button>
          </div>
        </div>

        {open ? (
          <nav
            id="console-nav-mobile"
            aria-label="Console mobile"
            className="border-t border-brand-900 bg-surface-bold md:hidden"
          >
            <ul className="container-page grid gap-1 py-3">
              {CONSOLE_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={isActive(item.href) ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-semibold',
                      isActive(item.href)
                        ? 'bg-brand-50 text-brand-900'
                        : 'text-brand-100 hover:bg-brand-900',
                    )}
                  >
                    <item.icon aria-hidden className="size-4" />
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="mt-1 flex flex-wrap gap-2 border-t border-brand-900 pt-3">
                <Link
                  href="/"
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-brand-100"
                >
                  Public site
                  <ExternalLink aria-hidden className="size-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className="inline-flex items-center gap-2 rounded-md border border-brand-700 px-3 py-2 text-sm font-semibold text-ink-inverse disabled:opacity-60"
                >
                  <LogOut aria-hidden className="size-4" />
                  Sign out
                </button>
              </li>
            </ul>
          </nav>
        ) : null}
      </header>

      <main id="main" className="flex-1 pb-16">
        <div className="container-page py-8 sm:py-10">{children}</div>
      </main>
    </div>
  );
}
