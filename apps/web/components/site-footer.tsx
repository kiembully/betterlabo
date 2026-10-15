import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { DATA_LICENSE } from '@betterlabo/shared';

import { EMERGENCY_NOTICE, INDEPENDENCE_NOTICE, NAV, SITE } from '@/lib/site';

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
          <p className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="grid size-9 place-items-center rounded-md bg-brand-900 font-mono text-sm font-bold text-brand-50"
            >
              BL
            </span>
            <span className="text-base font-bold tracking-tight text-ink">{SITE.name}</span>
          </p>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-ink-support">
            {INDEPENDENCE_NOTICE}
          </p>
          <p className="mt-4 text-xs leading-relaxed text-ink-subtle">{EMERGENCY_NOTICE}</p>
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
          </ul>
          <p className="mt-4 text-xs text-ink-subtle">
            Portal source under the {DATA_LICENSE.code} licence · v{version}
          </p>
        </div>
      </div>

      <div className="hazard-tape h-1.5" aria-hidden />
    </footer>
  );
}
