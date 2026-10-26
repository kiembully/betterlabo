import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_LICENSE } from '@betterlabo/shared';

import { LaboMark } from '@/components/brand/labo-mark';
import {
  CONTENT_NOTICE,
  COST_TO_PEOPLE,
  EMERGENCY_NOTICE,
  INDEPENDENCE_NOTICE,
  NAV,
  REPOSITORY,
  SITE,
} from '@/lib/site';

async function packageVersion(): Promise<string> {
  try {
    const pkg = JSON.parse(
      await readFile(join(process.cwd(), '..', '..', 'package.json'), 'utf8'),
    ) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export async function SiteFooter() {
  const version = await packageVersion();

  return (
    <footer className="no-print mt-16 border-t border-rule bg-surface">
      <div className="container-page grid gap-10 py-12 lg:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Link href="/" className="inline-flex items-center gap-3">
            {/* The mark's canvas is wider than it is tall, so it is sized by HEIGHT: a
                fixed square box letterboxes it and shrinks the emblem. */}
            <LaboMark className="h-11 w-auto shrink-0" />
            <span className="flex flex-col leading-none">
              <span className="text-base font-bold tracking-tight text-ink">{SITE.name}</span>
              <span className="mt-1 text-[0.6875rem] font-medium text-ink-subtle">
                Labo, Camarines Norte
              </span>
            </span>
          </Link>

          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-support">
            {INDEPENDENCE_NOTICE}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-ink-subtle">{EMERGENCY_NOTICE}</p>

          <div className="mt-6 max-w-md rounded-card border border-rule-strong bg-surface-sunken px-4 py-3.5">
            <p className="eyebrow">{COST_TO_PEOPLE.label}</p>
            <p className="mt-1 font-mono text-2xl font-semibold leading-none text-brand-900">
              {COST_TO_PEOPLE.value}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-subtle">{COST_TO_PEOPLE.note}</p>
          </div>
        </div>

        <nav aria-label="Footer">
          <p className="eyebrow">This portal</p>
          <ul className="mt-3 grid gap-1.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="text-sm text-ink-support transition-colors hover:text-brand-800"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <p className="eyebrow">Reuse and correct</p>
          <ul className="mt-3 grid gap-1.5 text-sm text-ink-support">
            <li>
              <Link href="/data" className="transition-colors hover:text-brand-800">
                Every dataset and its licence
              </Link>
            </li>
            <li>
              <a
                href={REPOSITORY.url}
                className="transition-colors hover:text-brand-800"
                rel="noreferrer noopener"
                target="_blank"
              >
                {REPOSITORY.label}
              </a>
            </li>
            <li>
              <a
                href="https://lgu.bettergov.ph/GUIDE"
                className="transition-colors hover:text-brand-800"
                rel="noreferrer noopener"
                target="_blank"
              >
                BetterGov.ph BetterLGU guide
              </a>
            </li>
            <li>
              <a
                href="https://data.bettergov.ph"
                className="transition-colors hover:text-brand-800"
                rel="noreferrer noopener"
                target="_blank"
              >
                BetterGov.ph Open Data Portal
              </a>
            </li>
            <li>
              {/* A plain anchor: `/sitemap.xml` is a metadata route, not an app route, so
                  next/link would try to prefetch and client-route it. */}
              <a href="/sitemap.xml" className="transition-colors hover:text-brand-800">
                Sitemap
              </a>
            </li>
          </ul>
          <p className="mt-4 text-xs text-ink-subtle">
            Portal source under the {DATA_LICENSE.code} licence · v{version}
          </p>
        </div>
      </div>

      <div className="border-t border-rule bg-surface-sunken">
        <div className="container-page flex flex-col gap-2 py-4 text-xs text-ink-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>{CONTENT_NOTICE}</p>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <li>
              <a
                href={REPOSITORY.url}
                className="font-medium transition-colors hover:text-brand-800"
                rel="noreferrer noopener"
                target="_blank"
              >
                {REPOSITORY.label}
              </a>
            </li>
            <li aria-hidden className="text-rule-strong">
              ·
            </li>
            <li>
              <a href="/sitemap.xml" className="transition-colors hover:text-brand-800">
                Sitemap
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="hazard-tape h-1.5" aria-hidden />
    </footer>
  );
}
