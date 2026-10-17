import type { Metadata } from 'next';
import Link from 'next/link';

import { ServicesDirectory } from '@/components/services/services-directory';
import { EmptyState, ProvenanceRow, SectionHeading } from '@/components/ui/primitives';
import { ETL_HINT, getHotlines, getServices } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Services',
  description:
    'Municipal services offered by the Municipality of Labo, with the requirements and fees the LGU publishes in its own Citizen’s Charter.',
};

export default async function ServicesPage() {
  const [services, hotlines] = await Promise.all([getServices(), getHotlines()]);

  if (!services || services.items.length === 0) {
    return (
      <div className="container-page py-14">
        <SectionHeading
          as="h1"
          eyebrow="Services"
          title="Municipal Services Directory"
          description="What the Municipality of Labo delivers, and what it publishes about each service."
        />
        <div className="mt-8">
          <EmptyState
            title="The services directory has not been compiled on this deployment."
            description="It is built from the LGU’s own Citizen’s Charter PDFs. Run the ETL to compile it."
            command={ETL_HINT}
          />
        </div>
      </div>
    );
  }

  const { categories, items, notPublished, servicePagesSeen } = services;

  // Categories the LGU publishes nothing for. A directory that renders an empty
  // card for Health looks like lost data; naming the gap is the honest version.
  const covered = new Set(categories.map((category) => category.name));
  const expected = [
    'Certificates & Vital Records',
    'Business, Trade & Investment',
    'Social Services & Assistance',
    'Health & Wellness',
    'Taxation & Payments',
    'Agriculture & Economic Development',
    'Infrastructure & Public Works',
    'Education & Scholarship',
    'Public Safety & Security',
    'Environment & Natural Resources',
  ];
  const gaps = expected.filter((name) => !covered.has(name));

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <section className="bg-surface-bold">
        <div className="container-page py-12 text-center sm:py-14">
          <p className="inline-flex items-center rounded-pill bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-ink-inverse">
            Services
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-inverse sm:text-4xl">
            Municipal Services Directory
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-inverse/80 sm:text-base">
            Browse services offered by the Municipality of Labo, with the requirements, fees and
            processing times the LGU publishes in its own Citizen&rsquo;s Charter.
          </p>
          <div className="mt-7">
            <ServicesDirectory categories={categories} services={items} />
          </div>
        </div>
      </section>

      <div className="container-page py-14">
        {/* ── What is not published ─────────────────────────────────────────── */}
        <SectionHeading
          eyebrow="Gaps"
          title="What the LGU does not publish"
          description="This directory shows only what the Citizen’s Charter actually states. Where a fee, a requirement or a processing time is not published, it is left blank here rather than filled in from another municipality’s charter — a wrong fee costs a resident a wasted trip."
        />

        {gaps.length > 0 && (
          <div className="mt-6 rounded-card border border-rule bg-surface-sunken p-5">
            <p className="text-sm font-semibold text-ink">
              No service charter published at all for:
            </p>
            <p className="mt-1.5 text-sm text-ink-support">{gaps.join(' · ')}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
              These are categories a municipality normally publishes. Their absence is recorded from
              the LGU&rsquo;s own site, not an omission here.
            </p>
          </div>
        )}

        {notPublished.length > 0 && (
          <details className="mt-4 rounded-card border border-rule bg-surface p-5">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
              {notPublished.length} specific gaps recorded
            </summary>
            <ul className="mt-3 space-y-2">
              {notPublished.map((item) => (
                <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-support">
                  <span aria-hidden className="text-ink-subtle">
                    —
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </details>
        )}

        {/* ── Emergency contacts ────────────────────────────────────────────── */}
        {hotlines && (
          <section className="mt-14">
            <SectionHeading
              eyebrow="Public safety"
              title="Emergency contacts"
              description="Disaster response, fire, police and health numbers for Labo, each with the source it was read from — and a flag wherever the published record contradicts itself."
              action={
                <Link
                  href="/hotlines"
                  className="inline-flex items-center rounded-md border border-rule-strong bg-surface px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300"
                >
                  Full hotline list
                </Link>
              }
            />
            <ul className="mt-6 grid gap-3 lg:grid-cols-2">
              {hotlines.tiers[0]?.entries.slice(0, 4).map((entry) => (
                <li key={entry.office} className="rounded-card border border-rule bg-surface p-4">
                  <p className="text-sm font-bold text-ink">{entry.office}</p>
                  <p className="mt-1.5 font-mono text-sm text-ink">
                    {entry.numbers.join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Provenance ───────────────────────────────────────────────────── */}
        <div className="mt-14">
          <ProvenanceRow
            items={[
              {
                label: 'services.json',
                value: `${items.length} services from ${servicePagesSeen.length} charter PDFs`,
                tone: 'brand',
              },
              {
                label: 'hotlines.json',
                value: `${hotlines ? hotlines.tiers.flatMap((tier) => tier.entries).length : 0} contacts`,
                tone: 'brand',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
