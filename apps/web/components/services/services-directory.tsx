'use client';

/**
 * The searchable Municipal Services Directory.
 *
 * A client component because search has to filter as you type, but a deliberately
 * dumb one: every record it can ever show arrives as props from the server, already
 * compiled into cached JSON. No network call is made here, so the page keeps working
 * with JavaScript busy and the static export stays static.
 *
 * It shows only categories that actually contain services. The categories the LGU
 * publishes nothing for are listed separately, as gaps — a directory that renders an
 * empty card for Health implies the portal lost the data rather than that the data
 * was never published.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Award,
  Banknote,
  Building2,
  FileText,
  HandHeart,
  HardHat,
  Leaf,
  Search,
  ShieldCheck,
  Sprout,
  Stethoscope,
  X,
} from 'lucide-react';

import type { ServiceCategory, ServiceRecord } from '@betterlabo/shared';


const ICONS: Array<{ match: RegExp; Icon: typeof FileText }> = [
  { match: /vital|civil|record|certificate/i, Icon: FileText },
  { match: /tax|payment/i, Icon: Banknote },
  { match: /social|assistance|welfare/i, Icon: HandHeart },
  { match: /infrastructure|public works|engineering/i, Icon: HardHat },
  { match: /business|trade|investment/i, Icon: Building2 },
  { match: /health|wellness/i, Icon: Stethoscope },
  { match: /agricultur|economic/i, Icon: Sprout },
  { match: /environment|natural/i, Icon: Leaf },
  { match: /education|scholarship/i, Icon: Award },
  { match: /safety|security/i, Icon: ShieldCheck },
];

function iconFor(category: string) {
  return ICONS.find((entry) => entry.match.test(category))?.Icon ?? FileText;
}

function matches(service: ServiceRecord, query: string): boolean {
  const haystack = [service.name, service.office, service.category, service.whereToGo]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function ServicesDirectory({
  categories,
  services,
}: {
  categories: ServiceCategory[];
  services: ServiceRecord[];
}) {
  const [query, setQuery] = useState('');

  const trimmed = query.trim();
  const results = useMemo(
    () => (trimmed === '' ? [] : services.filter((service) => matches(service, trimmed))),
    [services, trimmed],
  );

  return (
    <div>
      <div className="relative mx-auto w-full max-w-2xl">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-subtle"
        />
        <label className="sr-only" htmlFor="service-search">
          Search services
        </label>
        <input
          id="service-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search services (e.g. birth certificate, business permit)"
          className="w-full rounded-pill border border-rule-strong bg-surface py-3 pl-11 pr-11 text-sm text-ink shadow-card placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none"
        />
        {trimmed !== '' && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear the search"
            className="absolute right-3 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-pill text-ink-subtle transition-colors hover:bg-surface-sunken hover:text-ink"
          >
            <X aria-hidden className="size-4" />
          </button>
        )}
      </div>

      <p aria-live="polite" className="mt-3 text-center text-xs text-ink-inverse/75">
        {trimmed === ''
          ? `${services.length} services in ${categories.length} categories, as published by the LGU.`
          : `${results.length} ${results.length === 1 ? 'service matches' : 'services match'} “${trimmed}”.`}
      </p>

      {trimmed === '' ? (
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => {
            const Icon = iconFor(category.name);
            return (
              <li key={category.slug}>
                <Link
                  href={`/services/${category.slug}`}
                  className="group flex h-full items-stretch overflow-hidden rounded-card border border-rule bg-surface shadow-card transition-colors hover:border-brand-300"
                >
                  <span className="grid w-14 shrink-0 place-items-center bg-surface-brand text-brand-700">
                    <Icon aria-hidden className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col p-4">
                    <span className="text-sm font-bold text-ink">{category.name}</span>
                    <span className="mt-1 text-xs leading-relaxed text-ink-support">
                      {category.count} {category.count === 1 ? 'service' : 'services'} published.
                    </span>
                    <span className="mt-2 text-xs font-semibold text-brand-700 group-hover:underline">
                      View services →
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-8 space-y-3">
          {results.length === 0 && (
            <li className="rounded-card border border-rule bg-surface p-6 text-sm text-ink-support">
              No published service matches “{trimmed}”. The LGU&rsquo;s Citizen&rsquo;s Charter does not
              cover every service, and this directory only shows what it publishes — try a different
              word, or browse the categories.
            </li>
          )}
          {results.map((service) => {
            const Icon = iconFor(service.category);
            return (
              <li key={`${service.category}-${service.name}`}>
                <Link
                  href={`/services/${categories.find((c) => c.name === service.category)?.slug ?? ''}`}
                  className="flex items-start gap-3 rounded-card border border-rule bg-surface p-4 transition-colors hover:border-brand-300"
                >
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-surface-sunken text-brand-700">
                    <Icon aria-hidden className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{service.name}</span>
                    <span className="mt-0.5 block text-xs text-ink-subtle">
                      {service.category} · {service.office}
                    </span>
                    {service.fee && (
                      <span className="mt-1 block text-xs text-ink-support">Fee: {service.fee}</span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
