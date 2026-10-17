import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

import { SectionHeading } from '@/components/ui/primitives';
import { getServices } from '@/lib/data';

interface Params {
  category: string;
}

export async function generateStaticParams(): Promise<Params[]> {
  const services = await getServices();
  return (services?.categories ?? []).map((category) => ({ category: category.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { category } = await params;
  const services = await getServices();
  const match = services?.categories.find((entry) => entry.slug === category);
  if (!match) return { title: 'Services' };
  return {
    title: match.name,
    description: `${match.count} services under ${match.name} at the Municipality of Labo, with the requirements and fees the LGU publishes.`,
  };
}

export default async function ServiceCategoryPage({ params }: { params: Promise<Params> }) {
  const { category } = await params;
  const directory = await getServices();
  const match = directory?.categories.find((entry) => entry.slug === category);
  if (!directory || !match) notFound();

  const items = directory.items.filter((service) => service.category === match.name);

  return (
    <div className="container-page py-14">
      <Link href="/services" className="link text-sm">
        ← All services
      </Link>

      <div className="mt-6">
        <SectionHeading
          as="h1"
          eyebrow="Service category"
          title={match.name}
          description={`${items.length} ${items.length === 1 ? 'service' : 'services'} published by the Municipality of Labo, exactly as its Citizen’s Charter states them.`}
        />
      </div>

      <ul className="mt-8 space-y-4">
        {items.map((service) => (
          <li key={service.name} className="rounded-card border border-rule bg-surface p-5 sm:p-6">
            <h2 className="text-base font-bold text-ink">{service.name}</h2>
            <p className="mt-1 text-sm text-ink-support">{service.office}</p>

            <div className="mt-4 grid gap-5 sm:grid-cols-2">
              {service.requirements && service.requirements.length > 0 && (
                <div>
                  <p className="eyebrow">Bring</p>
                  <ul className="mt-2 space-y-1.5">
                    {service.requirements.map((requirement) => (
                      <li
                        key={requirement}
                        className="flex gap-2 text-xs leading-relaxed text-ink-support"
                      >
                        <span aria-hidden className="text-ink-subtle">
                          ·
                        </span>
                        <span>{requirement}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <dl className="space-y-3">
                <div>
                  <dt className="eyebrow">Fee</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-ink-support">
                    {service.fee ?? (
                      // Never rendered as ₱0.00: the charter prints no fee for this
                      // service, and a zero would read as "free".
                      <span className="text-ink-subtle">
                        Not published by the LGU — the charter leaves this blank.
                      </span>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Processing time</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-ink-support">
                    {service.processingTime ?? (
                      <span className="text-ink-subtle">Not published.</span>
                    )}
                  </dd>
                </div>
                {service.whereToGo && (
                  <div>
                    <dt className="eyebrow">Where to go</dt>
                    <dd className="mt-1 text-xs leading-relaxed text-ink-support">
                      {service.whereToGo}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <a
              href={service.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="link mt-4 inline-flex items-center gap-1.5 text-xs"
            >
              <ExternalLink aria-hidden className="size-3" />
              Read it in the LGU&rsquo;s Citizen&rsquo;s Charter (PDF)
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
