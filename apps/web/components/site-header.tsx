'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { cn } from '@/lib/cn';
import { NAV_GROUPS, SITE } from '@/lib/site';
import { LaboMark } from '@/components/brand/labo-mark';

/**
 * The public masthead. One component, two layouts: grouped panels from `lg`, and a
 * grouped slide-over below it.
 *
 * WHY GROUPED
 *
 * Thirteen flat items overflowed the rail and wrapped the last one onto a second line.
 * Four groups, split by what a visitor is trying to do rather than by internal
 * structure, keep every destination one level deep while the masthead shows four
 * triggers.
 *
 * Each panel opens on click and on hover, and closes on Escape, on an outside click
 * and on navigation. The panel is plain markup rather than a `<dialog>`: there is no
 * focus trap to get wrong, and every link is in the tab order once it is open.
 *
 * The flat `NAV` list still renders in the footer, so no page becomes unreachable
 * while a panel is shut, and print output keeps the full list.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const navRef = useRef<HTMLElement | null>(null);

  // Close the mobile panel and any open group on navigation.
  useEffect(() => {
    setOpen(false);
    setOpenGroup(null);
  }, [pathname]);

  // Without these, a click-only panel can be left open over the page with no obvious
  // way back — especially on a pointer that has no hover to move away with.
  useEffect(() => {
    if (openGroup === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroup(null);
    };
    const onPointer = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenGroup(null);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [openGroup]);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  const groupActive = (group: (typeof NAV_GROUPS)[number]) =>
    group.items.some((item) => isActive(item.href));

  return (
    <header className="no-print sticky top-0 z-50 border-b border-rule bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <div className="container-page flex h-16 items-center gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <LaboMark className="size-10 shrink-0" />
          <span className="flex flex-col leading-none">
            <span className="text-base font-bold tracking-tight text-ink">{SITE.name}</span>
            <span className="hidden text-[0.6875rem] font-medium text-ink-subtle xs:block">
              Labo, Camarines Norte
            </span>
          </span>
        </Link>

        <nav ref={navRef} aria-label="Primary" className="ml-auto hidden lg:block">
          <ul className="flex items-center gap-0.5">
            {NAV_GROUPS.map((group) => {
              const isOpen = openGroup === group.label;
              const active = groupActive(group);
              return (
                <li
                  key={group.label}
                  className="relative"
                  onMouseEnter={() => setOpenGroup(group.label)}
                  onMouseLeave={() =>
                    setOpenGroup((current) => (current === group.label ? null : current))
                  }
                >
                  <button
                    type="button"
                    onClick={() => setOpenGroup(isOpen ? null : group.label)}
                    aria-expanded={isOpen}
                    aria-haspopup="true"
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      active || isOpen
                        ? 'bg-brand-50 text-brand-900'
                        : 'text-ink-support hover:bg-gray-100 hover:text-ink',
                    )}
                  >
                    {group.label}
                    <ChevronDown
                      aria-hidden
                      className={cn('size-3.5 transition-transform', isOpen && 'rotate-180')}
                    />
                  </button>

                  {isOpen ? (
                    <div className="absolute left-0 top-full z-50 w-56 pt-1.5">
                      <ul className="rounded-card border border-rule bg-surface p-1.5 shadow-raised">
                        {group.items.map((item) => (
                          <li key={item.href}>
                            <Link
                              href={item.href}
                              aria-current={isActive(item.href) ? 'page' : undefined}
                              className={cn(
                                'block rounded-md px-3 py-2 text-sm transition-colors',
                                isActive(item.href)
                                  ? 'bg-brand-50 font-semibold text-brand-900'
                                  : 'text-ink-support hover:bg-gray-100 hover:text-ink',
                              )}
                            >
                              {item.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </li>
              );
            })}
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
          className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-md border border-rule-strong px-3 py-2 text-sm font-semibold text-ink lg:hidden"
        >
          <span className="sr-only">Toggle navigation</span>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden fill="none">
            {open ? (
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            ) : (
              <path
                d="M2 4.5h12M2 8h12M2 11.5h12"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            )}
          </svg>
          Menu
        </button>
      </div>

      {open ? (
        <nav
          id="primary-nav-mobile"
          aria-label="Primary mobile"
          className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-rule bg-surface lg:hidden"
        >
          <div className="container-page py-3">
            <Link
              href="/report"
              className="mb-2 flex items-center justify-center rounded-md bg-brand-900 px-3.5 py-2.5 text-sm font-semibold text-brand-50"
            >
              Report an issue
            </Link>

            {NAV_GROUPS.map((group) => (
              <section key={group.label} className="border-t border-rule py-2">
                <h2 className="px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-ink-subtle">
                  {group.label}
                </h2>
                <ul className="grid gap-0.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={cn(
                          'block rounded-md px-3 py-2.5 text-sm font-semibold',
                          isActive(item.href)
                            ? 'bg-brand-50 text-brand-900'
                            : 'text-ink hover:bg-gray-100',
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
