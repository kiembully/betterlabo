/**
 * A brief history of Labo.
 *
 * Two things it refuses to do, both of which a municipal website usually does:
 *
 *  - It does not pick one founding date. Sources genuinely disagree (a 1590s
 *    encomienda account, a 1636 visita, and the municipality's own 1997 resolution
 *    dating the town to 8 September 1800), so the disagreement is stated.
 *  - It does not repeat the colourful claims that no primary source supports. Those
 *    are listed separately as unsourced rather than dressed up as history.
 */
import { ExternalLink } from 'lucide-react';

import type { LaboHistory } from '@betterlabo/shared';

import { cn } from '@/lib/cn';

export function BriefHistory({ history, className }: { history: LaboHistory; className?: string }) {
  const { landArea, population } = history;

  return (
    <div className={cn(className)}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="max-w-prose space-y-4">
          {history.prose.map((paragraph) => (
            <p key={paragraph.slice(0, 40)} className="text-sm leading-relaxed text-ink-support">
              {paragraph}
            </p>
          ))}
        </div>

        <aside className="space-y-4">
          {population && (
            <div className="rounded-card border border-rule bg-surface p-4">
              <p className="eyebrow">Population</p>
              <p className="mt-1 font-mono text-xl font-bold text-ink">{population.value}</p>
              <p className="mt-0.5 text-xs text-ink-subtle">{population.year} census</p>
              {population.series && population.series.length > 1 && (
                <dl className="mt-3 space-y-1 border-t border-rule pt-3">
                  {population.series.map((point) => (
                    <div key={point.year} className="flex justify-between text-xs">
                      <dt className="text-ink-subtle">{point.year}</dt>
                      <dd className="font-mono text-ink-support">
                        {point.value.toLocaleString('en-PH')}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}

          {landArea && (
            <div className="rounded-card border border-rule bg-surface p-4">
              <p className="eyebrow">Land area</p>
              {landArea.disputed && (
                <p className="mt-1.5 text-xs leading-relaxed text-ink-subtle">
                  Sources disagree. All published figures are shown.
                </p>
              )}
              <dl className="mt-2 space-y-2">
                {landArea.figures.map((figure) => (
                  <div key={`${figure.km2}`}>
                    <dt className="flex items-baseline gap-1.5">
                      <span
                        className={cn(
                          'font-mono text-sm font-semibold',
                          figure.preferred ? 'text-ink' : 'text-ink-support',
                        )}
                      >
                        {figure.km2.toLocaleString('en-PH')} km²
                      </span>
                      {figure.preferred && (
                        <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-brand-700">
                          official
                        </span>
                      )}
                    </dt>
                    <dd className="mt-0.5 text-[0.6875rem] leading-relaxed text-ink-subtle">
                      {figure.source}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </aside>
      </div>

      {history.notableFacts.length > 0 && (
        <section className="mt-10">
          <h3 className="text-sm font-bold text-ink">Worth knowing</h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {history.notableFacts.map((fact) => (
              <li key={fact.slice(0, 40)} className="flex gap-2 text-xs leading-relaxed text-ink-support">
                <span aria-hidden className="text-brand-700">
                  ·
                </span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <details className="mt-8 rounded-card border border-rule bg-surface p-5">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Sources ({history.citations.length}) and claims we could not verify
          {history.unsourced.length > 0 ? ` (${history.unsourced.length})` : ''}
        </summary>

        <ol className="mt-4 space-y-2.5">
          {history.citations.map((citation) => (
            <li key={citation.sourceUrl + citation.claim.slice(0, 20)} className="text-xs leading-relaxed">
              <span className="text-ink-support">{citation.claim}</span>{' '}
              <a
                href={citation.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="link inline-flex items-center gap-1 whitespace-nowrap"
              >
                <ExternalLink aria-hidden className="size-3" />
                source
              </a>
            </li>
          ))}
        </ol>

        {history.unsourced.length > 0 && (
          <div className="mt-5 border-t border-rule pt-4">
            <p className="text-sm font-semibold text-ink">
              Commonly repeated, but no primary source found
            </p>
            <p className="mt-1 text-xs leading-relaxed text-ink-subtle">
              Listed rather than printed as fact. Several are in wide circulation.
            </p>
            <ul className="mt-2.5 space-y-2">
              {history.unsourced.map((item) => (
                <li key={item.slice(0, 40)} className="flex gap-2 text-xs leading-relaxed text-ink-support">
                  <span aria-hidden className="text-ink-subtle">
                    ?
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </details>

      <p className="mt-3 text-[0.6875rem] text-ink-subtle">
        Compiled {history.retrievedAt ?? 'undated'} from National Historical Commission markers, the
        Official Gazette, the Philippine Statistics Authority, the provincial government and the
        municipality&rsquo;s own records.
      </p>
    </div>
  );
}
