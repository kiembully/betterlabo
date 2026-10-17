/**
 * Emergency and public-safety contacts for Labo.
 *
 * Design rules, in order of importance:
 *
 *  1. The portal is NOT an emergency channel. It says so first, because someone in
 *     a flood should be dialling, not reading a website.
 *  2. Every number carries the source it came from, and its verification state.
 *     Where two official sources publish DIFFERENT numbers for the same station,
 *     both are shown and marked as disputed — silently picking one would hide a
 *     real problem from the people it affects.
 *  3. National numbers are visually separated and labelled, so a national hotline
 *     can never be mistaken for Labo's own.
 *  4. The LGU's own published defects (unfilled placeholder numbers) are surfaced
 *     rather than quietly worked around. A citizen dialling the municipality's own
 *     listed police number reaches nothing, and that is worth knowing.
 */
import { AlertTriangle, ExternalLink, Phone } from 'lucide-react';

import type { HotlineBoard as HotlineBoardData, HotlineConfidence, HotlineEntry } from '@betterlabo/shared';

import { Chip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const CONFIDENCE: Record<HotlineConfidence, { label: string; tone: 'good' | 'warn' | 'bad' | 'default' }> = {
  high: { label: 'Verified', tone: 'good' },
  medium: { label: 'Unconfirmed', tone: 'warn' },
  low: { label: 'Low confidence', tone: 'bad' },
  disputed: { label: 'Sources differ', tone: 'warn' },
};

/** A dialable tel: link — the whole point of the section. */
function Dial({ number }: { number: string }) {
  const dialable = number.replace(/[^\d+]/g, '');
  return (
    <a
      href={`tel:${dialable}`}
      className="inline-flex items-center gap-1.5 rounded-md border border-rule-strong bg-surface px-2.5 py-1 font-mono text-sm font-semibold text-ink transition-colors hover:border-brand-300"
    >
      <Phone aria-hidden className="size-3.5 text-brand-700" />
      {number}
    </a>
  );
}

function Entry({ entry }: { entry: HotlineEntry }) {
  const badge = CONFIDENCE[entry.confidence];
  return (
    <li className="rounded-card border border-rule bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-bold text-ink">{entry.office}</p>
        <span className="flex items-center gap-1.5">
          {entry.isNational === true && <Chip tone="brand">National</Chip>}
          <Chip tone={badge.tone}>{badge.label}</Chip>
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-2">
        {entry.numbers.map((number, index) => (
          <span key={number} className="flex items-center gap-1.5">
            <Dial number={number} />
            {entry.carriers?.[index] && (
              <span className="text-xs text-ink-subtle">{entry.carriers[index]}</span>
            )}
          </span>
        ))}
      </div>

      {entry.note && (
        <p className="mt-2.5 text-xs leading-relaxed text-ink-support">{entry.note}</p>
      )}

      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-ink-subtle">
        {entry.sources.map((source) => (
          <a
            key={source}
            href={source}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            <ExternalLink aria-hidden className="size-3" />
            {source.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
          </a>
        ))}
      </p>
    </li>
  );
}

export function HotlineBoard({
  board,
  className,
}: {
  board: HotlineBoardData;
  className?: string;
}) {
  return (
    <div className={cn(className)}>
      <div className="rounded-card border border-hazard-high/40 bg-hazard-high/[0.06] p-4">
        <p className="flex items-center gap-2 text-sm font-bold text-ink">
          <AlertTriangle aria-hidden className="size-4 text-hazard-high" />
          In a life-threatening emergency, call 911.
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-support">
          This page is a directory, not a dispatch service, and nobody here is watching it. Call the
          numbers below directly, or go to the nearest barangay hall or police station.
        </p>
      </div>

      {board.defects.length > 0 && (
        <div className="mt-4 rounded-card border border-rule-strong bg-surface-sunken p-4">
          <p className="eyebrow">Defect in the published record</p>
          {board.defects.map((defect) => (
            <div key={defect.what} className="mt-2">
              <p className="text-sm font-semibold text-ink">{defect.what}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-support">{defect.detail}</p>
              {defect.source && (
                <a
                  href={defect.source}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link mt-1 inline-flex items-center gap-1 text-xs"
                >
                  <ExternalLink aria-hidden className="size-3" />
                  the municipality&rsquo;s own page, as archived
                </a>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 space-y-6">
        {board.tiers.map((tier) => (
          <section key={tier.tier}>
            <h3 className="text-sm font-bold tracking-tight text-ink">{tier.tier}</h3>
            <ul className="mt-3 grid gap-3 lg:grid-cols-2">
              {tier.entries.map((entry) => (
                <Entry key={`${entry.office}-${entry.numbers.join()}`} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {board.notFound.length > 0 && (
        <section className="mt-6 rounded-card border border-rule bg-surface-sunken p-4">
          <h3 className="text-sm font-bold text-ink">Not published anywhere we could find</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-support">
            Listed so a missing number is not mistaken for an oversight here — these were searched
            for and the LGU publishes nothing.
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {board.notFound.map((item) => (
              <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-support">
                <span aria-hidden className="text-ink-subtle">
                  —
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-[0.6875rem] leading-relaxed text-ink-subtle">
        Read from the sources cited above on {board.retrievedAt ?? 'an unrecorded date'}
        {board.upstreamDefects.length > 0
          ? ` — including ${board.upstreamDefects.length} disagreement${board.upstreamDefects.length === 1 ? '' : 's'} between official sources.`
          : '.'}{' '}
        Verify before relying on any number, and tell us if one is wrong.
      </p>
    </div>
  );
}
