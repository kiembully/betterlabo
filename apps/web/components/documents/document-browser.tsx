'use client';

/**
 * The LGU's published document index, browsed in the browser.
 *
 * The index is ~1,500 entries and ~660 KB, so it lives in its own static file
 * (`/data/lgu-documents.json`) and is fetched when this component mounts rather
 * than being baked into the page's HTML. The public site never calls an API for
 * it — the file is served straight from the CDN alongside every other cached
 * JSON bundle.
 */
import { useEffect, useMemo, useState } from 'react';

import type { LguDocumentIndex } from '@betterlabo/shared';

import { Chip, EmptyState, Eyebrow } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const PAGE_SIZE = 60;

/**
 * Client components must NOT import `@/lib/data` — that module is `server-only`
 * and doing so fails the build. Every other client-side data fetch in this app
 * uses the literal public path (see components/map/map-explorer.tsx), so this
 * one does too. The file is a committed static asset served from /public.
 */
const DOCUMENTS_URL = '/data/lgu-documents.json';

/** A human label and chip tone per document kind, so the list is scannable. */
const KIND_LABELS: Record<string, { label: string; tone: 'default' | 'brand' | 'good' | 'warn' }> = {
  'notice-to-proceed': { label: 'Notice to proceed', tone: 'brand' },
  'notice-of-award': { label: 'Notice of award', tone: 'good' },
  'invitation-to-bid': { label: 'Invitation to bid', tone: 'warn' },
  'request-for-quotation': { label: 'Request for quotation', tone: 'default' },
  report: { label: 'Report', tone: 'default' },
  document: { label: 'Document', tone: 'default' },
};

export function DocumentBrowser() {
  const [index, setIndex] = useState<LguDocumentIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<string>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    fetch(DOCUMENTS_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<LguDocumentIndex>;
      })
      .then((data) => {
        if (!cancelled) setIndex(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const results = useMemo(() => {
    if (!index) return [];
    const needle = query.trim().toLowerCase();
    return index.items.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false;
      if (!needle) return true;
      return item.title.toLowerCase().includes(needle) || item.slug.toLowerCase().includes(needle);
    });
  }, [index, query, kind]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [query, kind]);

  if (error) {
    return (
      <EmptyState
        title="The document index could not be loaded"
        description={`The browser request for ${DOCUMENTS_URL} failed (${error}).`}
        command="npm run etl lgu"
      />
    );
  }

  if (!index) {
    return (
      <p className="text-sm text-ink-subtle" role="status">
        Loading the document index…
      </p>
    );
  }

  const kinds = Object.entries(index.byKind).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="doc-search" className="block text-xs font-semibold tracking-wide text-ink-subtle uppercase">
            Search titles
          </label>
          <input
            id="doc-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. flood control, barangay dalas, PR25"
            className="mt-1.5 w-full rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          />
        </div>
        <div>
          <label htmlFor="doc-kind" className="block text-xs font-semibold tracking-wide text-ink-subtle uppercase">
            Type
          </label>
          <select
            id="doc-kind"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            className="mt-1.5 rounded-md border border-rule-strong bg-surface px-3 py-2 text-sm text-ink"
          >
            <option value="all">All types ({index.count})</option>
            {kinds.map(([key, count]) => (
              <option key={key} value={key}>
                {KIND_LABELS[key]?.label ?? key} ({count})
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="mt-4 text-sm text-ink-support" role="status">
        {results.length} document{results.length === 1 ? '' : 's'}
        {kind === 'all' ? '' : ` of type ${KIND_LABELS[kind]?.label ?? kind}`}
        {query.trim() ? ` matching “${query.trim()}”` : ''}.
      </p>

      <ul className="mt-4 divide-y divide-rule overflow-hidden rounded-card border border-rule">
        {results.slice(0, limit).map((item) => (
          <li key={item.slug} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <a
                className="link text-sm font-medium"
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {item.title}
              </a>
              <p className="mt-0.5 text-xs text-ink-subtle">
                /docs/{item.slug}
                {item.lastSeen ? ` · last published ${item.lastSeen}` : ''}
              </p>
            </div>
            <Chip tone={KIND_LABELS[item.kind]?.tone ?? 'default'}>
              {KIND_LABELS[item.kind]?.label ?? item.kind}
            </Chip>
          </li>
        ))}
      </ul>

      {results.length === 0 ? (
        <p className="mt-6 text-sm text-ink-subtle">Nothing matches that search.</p>
      ) : null}

      {results.length > limit ? (
        <button
          type="button"
          onClick={() => setLimit((value) => value + PAGE_SIZE)}
          className={cn(
            'mt-5 inline-flex items-center rounded-md border border-rule-strong bg-surface',
            'px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-300',
          )}
        >
          Show {Math.min(PAGE_SIZE, results.length - limit)} more
        </button>
      ) : null}

      <div className="mt-10 rounded-card border border-rule bg-sunken p-4">
        <Eyebrow>About this list</Eyebrow>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-ink-support">{index.note}</p>
        <p className="mt-2 text-xs text-ink-subtle">
          Built from{' '}
          <a className="link" href={index.sourceIndex} target="_blank" rel="noreferrer noopener">
            the reference index of /docs/ paths
          </a>
          .
        </p>
      </div>
    </div>
  );
}
