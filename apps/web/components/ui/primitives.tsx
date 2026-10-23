import Link from 'next/link';

import { cn } from '@/lib/cn';
import { formatBytes, formatNumber, formatPeso } from '@betterlabo/shared';

/**
 * Presentational primitives shared by every module. They exist so that a figure,
 * a card and an empty state look identical on the map, the budget explorer and
 * the directory — and so the delegated UI work has one vocabulary to build on.
 */

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn('eyebrow', className)}>{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
  as: As = 'h2',
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  as?: 'h1' | 'h2' | 'h3';
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <div className="max-w-3xl">
        {eyebrow ? <Eyebrow className="mb-2">{eyebrow}</Eyebrow> : null}
        <As className="text-2xl font-bold text-ink sm:text-3xl">{title}</As>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-ink-support sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  hint?: React.ReactNode;
  tone?: 'default' | 'brand' | 'warning';
}) {
  return (
    <div
      className={cn(
        'card min-w-0 p-4 sm:p-5',
        tone === 'brand' && 'border-brand-200 bg-brand-50',
        tone === 'warning' && 'border-accent-orange-200 bg-accent-orange-50',
      )}
    >
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-2 flex items-baseline gap-1.5">
        {/* One step smaller below `xs`: a compact peso figure in tabular mono is
            113px wide, and two tiles on a 320px phone leave 106px each. */}
        <span className="font-mono text-xl font-semibold tracking-tight text-ink xs:text-2xl sm:text-3xl">
          {value}
        </span>
        {unit ? <span className="text-xs font-semibold text-ink-support">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">{hint}</p> : null}
    </div>
  );
}

/**
 * A peso figure. `null` renders as an em dash, never as ₱0.00 — the compiled
 * data uses null for "the source did not report this".
 */
export function Money({
  value,
  compact = false,
  className,
}: {
  value: number | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('figure-num', className)} title={compact ? formatPeso(value) : undefined}>
      {formatPeso(value, { compact })}
    </span>
  );
}

export function Chip({
  children,
  tone = 'default',
  title,
}: {
  children: React.ReactNode;
  tone?: 'default' | 'brand' | 'good' | 'warn' | 'bad';
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'chip',
        tone === 'brand' && 'border-brand-300 bg-brand-50 text-brand-900',
        tone === 'good' && 'border-accent-green-500/40 bg-accent-green-50 text-accent-green-700',
        tone === 'warn' && 'border-accent-orange-500/40 bg-accent-orange-50 text-accent-orange-700',
        tone === 'bad' && 'border-accent-red-500/40 bg-accent-red-50 text-accent-red-700',
      )}
    >
      {children}
    </span>
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="meter" style={{ ['--value' as string]: String(pct) }} role="img" aria-label={label} />
  );
}

/**
 * Empty state. Always names the next step, so a fresh clone is demoable before
 * anybody has run the ETL.
 */
export function EmptyState({
  title,
  description,
  command,
  action,
}: {
  title: string;
  description: React.ReactNode;
  command?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="card survey-grid p-6 sm:p-10">
      <div className="max-w-2xl">
        <Eyebrow>Nothing to show yet</Eyebrow>
        <h3 className="mt-2 text-lg font-bold text-ink">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-support">{description}</p>
        {command ? (
          <pre className="mt-4 overflow-x-auto rounded-lg bg-gray-950 px-3 py-2 text-xs text-gray-100">
            <code>{command}</code>
          </pre>
        ) : null}
        {action ? (
          <Link
            href={action.href}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 underline"
          >
            {action.label}
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** Row of provenance chips for a compiled data file. */
export function ProvenanceRow({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode; tone?: 'default' | 'brand' | 'warn' | 'bad' }>;
}) {
  return (
    <dl className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <Chip tone={item.tone ?? 'default'} title={item.label}>
            <dt className="sr-only">{item.label}</dt>
            <dd className="flex items-center gap-1.5">
              <span className="font-semibold text-ink-subtle">{item.label}</span>
              <span>{item.value}</span>
            </dd>
          </Chip>
        </div>
      ))}
    </dl>
  );
}

/** A definition row used in the profile and dataset tables. */
export function DefRow({
  term,
  children,
}: {
  term: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-rule py-2.5 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-4">
      <dt className="w-full shrink-0 text-xs font-semibold tracking-wide text-ink-subtle uppercase sm:w-56">
        {term}
      </dt>
      <dd className="text-sm text-ink">{children}</dd>
    </div>
  );
}

export { formatBytes, formatNumber };
