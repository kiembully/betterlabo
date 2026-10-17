import type { Metadata } from 'next';
import { CalendarDays, ExternalLink, Info } from 'lucide-react';

import { EmptyState, SectionHeading } from '@/components/ui/primitives';
import { ETL_HINT, getLguUpdates } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Latest updates',
  description:
    'News announced by the Municipality of Labo on its own website, and the LGU’s official Facebook page.',
};

const FACEBOOK = 'https://www.facebook.com/LGULaboCamNorte';

function formatDate(iso: string): string {
  // The posts carry a naive local timestamp; parse the date part only, so the
  // rendered day cannot shift because the server clock is UTC.
  const [datePart = ''] = iso.split('T');
  const [year, month, day] = datePart.split('-').map((part) => Number.parseInt(part, 10));
  if (!year || !month || !day) return datePart;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default async function UpdatesPage() {
  const updates = await getLguUpdates();

  return (
    <div className="container-page py-14">
      <SectionHeading
        as="h1"
        eyebrow="Updates"
        title="Latest from the Municipality"
        description="Notices and announcements the LGU has published on its own website. This is not the only place the municipality posts — for day-to-day announcements, the official Facebook page is usually faster."
      />

      {/* ── The LGU's own channel, where most announcements actually land ───── */}
      <div className="mt-8 flex flex-col gap-4 rounded-card border border-rule bg-surface-sunken p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-subtle" />
          <div>
            <p className="text-sm font-semibold text-ink">
              The official page is where the LGU posts most often
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-support">
              Announcements, class suspensions, road closures and advisories usually appear on
              Facebook first. This portal compiles what is published on the municipal website, which
              is a smaller and slower feed.
            </p>
          </div>
        </div>
        <a
          href={FACEBOOK}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-md bg-brand-900 px-4 py-2.5 text-sm font-semibold text-brand-50 transition-colors hover:bg-brand-800"
        >
          <ExternalLink aria-hidden className="size-4" />
          Follow LGU Labo on Facebook
        </a>
      </div>

      {!updates || updates.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="No updates have been compiled on this deployment."
            description="Posts are read from the LGU’s own website through the Internet Archive. Run the ETL to compile them."
            command={ETL_HINT}
            action={{ href: '/data', label: 'See the data sources' }}
          />
        </div>
      ) : (
        <>
          <ul className="mt-8 space-y-3">
            {updates.items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block rounded-card border border-rule bg-surface p-5 transition-colors hover:border-brand-300"
                >
                  <p className="flex items-center gap-1.5 text-xs font-medium text-ink-subtle">
                    <CalendarDays aria-hidden className="size-3.5" />
                    <time dateTime={item.date}>{formatDate(item.date)}</time>
                  </p>
                  <h2 className="mt-2 text-base font-bold leading-snug text-ink">{item.title}</h2>
                  {item.excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-support">
                      {item.excerpt}
                    </p>
                  )}
                  <p className="mt-2.5 text-xs font-semibold text-brand-700">
                    Read it on labo.gov.ph →
                  </p>
                </a>
              </li>
            ))}
          </ul>

          {/* ── Why the feed is shorter than the site is ───────────────────── */}
          <div className="mt-8 rounded-card border border-rule bg-surface-sunken p-5">
            <p className="eyebrow">About this list</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-support">
              The municipality&rsquo;s website runs on WordPress and has been abused: injected SEO
              content (&ldquo;crypto casino&rdquo; pages and similar) sits alongside genuine
              announcements, together with dozens of unpublished drafts. Those are filtered out, and{' '}
              <strong className="font-semibold text-ink">
                {updates.excludedCount} {updates.excludedCount === 1 ? 'post was' : 'posts were'}{' '}
                excluded
              </strong>{' '}
              {updates.excludedCount === 1 ? 'as a result' : 'for that reason'}. Every exclusion and
              its reason is recorded in{' '}
              <a href="/data/lgu-updates.json" className="link">
                the compiled file
              </a>
              . Anything that could not be classified is excluded rather than guessed at — on a
              transparency portal a wrong headline is worse than a missing one.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-ink-subtle">
              Read from the LGU&rsquo;s own site through the Internet Archive on{' '}
              {new Date(updates.generatedAt).toLocaleDateString('en-PH', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
                timeZone: 'Asia/Manila',
              })}
              {updates.unreachableCount > 0
                ? ` · ${updates.unreachableCount} posts could not be retrieved`
                : ''}
              .
            </p>
          </div>
        </>
      )}
    </div>
  );
}
