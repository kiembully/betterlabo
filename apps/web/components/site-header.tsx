'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { cn } from '@/lib/cn';
import { NAV, SITE } from '@/lib/site';
import { LaboMark } from '@/components/brand/labo-mark';

/**
 * The public masthead. One component, two layouts: a horizontal rail from `lg`,
 * and a disclosure-free slide-over below it. The panel is a `<dialog>`-less
 * plain block so it stays keyboard-operable without focus-trap machinery.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile panel on navigation.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="no-print sticky top-0 z-50 border-b border-rule bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <LaboMark className="h-8 w-auto shrink-0" />
          <span className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight text-ink">{SITE.name}</span>
            <span className="hidden text-[0.6875rem] font-medium text-ink-subtle xs:block">
              Labo, Camarines Norte
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'inline-flex items-center rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                    isActive(item.href)
                      ? 'bg-brand-50 text-brand-900'
                      : 'text-ink-support hover:bg-gray-100 hover:text-ink',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <Link
          href="/report"
          className="ml-auto hidden rounded-md bg-brand-900 px-3.5 py-2 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800 lg:ml-3 lg:inline-flex"
        >
          Report an issue
        </Link>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="primary-nav-mobile"
          className="ml-auto inline-flex items-center gap-2 rounded-md border border-rule-strong px-3 py-2 text-sm font-semibold text-ink lg:hidden"
        >
          <span className="sr-only">Toggle navigation</span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
            {open ? (
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            ) : (
              <path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
            )}
          </svg>
          Menu
        </button>
      </div>

      {open ? (
        <nav
          id="primary-nav-mobile"
          aria-label="Primary mobile"
          className="border-t border-rule bg-surface lg:hidden"
        >
          <ul className="container-page grid gap-0.5 py-3">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? 'page' : undefined}
                  className={cn(
                    'block rounded-md px-3 py-2.5 text-sm font-semibold',
                    isActive(item.href) ? 'bg-brand-50 text-brand-900' : 'text-ink hover:bg-gray-100',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
