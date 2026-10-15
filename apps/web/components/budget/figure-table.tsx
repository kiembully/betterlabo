import { formatPercent } from '@betterlabo/shared';
import type { FiscalSheet } from '@betterlabo/shared';

import { Money, Meter } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

import { derivedShare, isTotalLabel, normaliseLabel } from './model';

interface Props {
  sheet: FiscalSheet;
  /** Drop rows the source itself reports as zero. */
  hideZeros: boolean;
  /** normalised row label -> titles of other sections publishing the same label. */
  collisions: Map<string, string[]>;
}

/**
 * Every row of one compiled section, exactly as published.
 *
 * A null amount renders as an em dash (never ₱0.00) — `Money` owns that rule.
 * A share the source did not publish is computed only when the row can be
 * divided by the listed rows, and is marked `~` so it can never be mistaken for
 * a figure BLGF printed.
 */
export function FigureTable({ sheet, hideZeros, collisions }: Props) {
  const isRatio = sheet.unit === '%';
  const rows = hideZeros ? sheet.figures.filter((figure) => figure.amount !== 0) : sheet.figures;
  const hiddenZeros = sheet.figures.length - rows.length;

  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-rule bg-surface-sunken p-3 text-xs leading-relaxed text-ink-support">
        {hiddenZeros > 0
          ? `All ${hiddenZeros} row${hiddenZeros === 1 ? '' : 's'} of this section are reported as zero and are hidden by the “Hide rows reported as zero” filter.`
          : 'The source lists no rows for this section.'}
      </p>
    );
  }

  const totalRowPublished = sheet.figures.some((figure) => isTotalLabel(figure.label));

  return (
    <div className="overflow-x-auto scrollbar-none">
      <table className="w-full border-collapse text-left text-[0.8125rem] sm:text-sm">
        <caption className="sr-only">
          {sheet.title} — rows as published by the source, in source order
        </caption>
        <thead>
          <tr className="border-b border-rule-strong">
            <th scope="col" className="py-2 pr-2 text-[0.6875rem] font-bold tracking-wider text-ink-subtle uppercase">
              Row as published
            </th>
            <th
              scope="col"
              className="py-2 pr-2 text-right text-[0.6875rem] font-bold tracking-wider text-ink-subtle uppercase"
            >
              {isRatio ? 'Ratio' : 'Amount'}
            </th>
            {isRatio ? null : (
              <th
                scope="col"
                className="w-16 py-2 text-right text-[0.6875rem] font-bold tracking-wider text-ink-subtle uppercase"
              >
                Share
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((figure, index) => {
            const share = isRatio ? null : (figure.sharePercent ?? derivedShare(sheet, figure));
            const computed = !isRatio && figure.sharePercent == null && share != null;
            const isTotal = isTotalLabel(figure.label);
            const others = (collisions.get(normaliseLabel(figure.label)) ?? []).filter(
              (title) => title !== sheet.title,
            );
            return (
              <tr
                key={`${figure.label}-${index}`}
                className={cn(
                  'border-b border-rule last:border-b-0',
                  isTotal && 'border-t border-rule-strong bg-surface-sunken',
                  figure.amount === 0 && !isTotal && 'text-ink-subtle',
                )}
              >
                <th scope="row" className="w-full py-2 pr-2 align-top font-medium break-words">
                  <span className={cn('text-ink', isTotal && 'font-bold')}>{figure.label}</span>
                  {figure.amount === 0 ? (
                    <span className="ml-1.5 rounded-pill bg-gray-100 px-1.5 py-0.5 text-[0.625rem] font-semibold whitespace-nowrap text-ink-subtle">
                      source reports 0
                    </span>
                  ) : null}
                  {figure.note ? (
                    <span className="mt-1 block text-[0.6875rem] leading-relaxed font-normal text-ink-subtle">
                      {figure.note}
                    </span>
                  ) : null}
                  {others.length > 0 ? (
                    <span
                      className="mt-1 block text-[0.625rem] leading-relaxed font-normal text-accent-orange-700"
                      title={`The same row label appears in: ${others.join('; ')}`}
                    >
                      same label in {others.length === 1 ? `“${others[0]}”` : `${others.length} other sections`}
                    </span>
                  ) : null}
                </th>
                <td className="py-2 pr-2 text-right align-top whitespace-nowrap">
                  {isRatio ? (
                    <span className="figure-num text-ink">{formatPercent(figure.amount, 2)}</span>
                  ) : (
                    <Money value={figure.amount} className={isTotal ? 'text-ink' : undefined} />
                  )}
                </td>
                {isRatio ? null : (
                  <td className="py-2 text-right align-top">
                    {share == null ? (
                      <span
                        className="figure-num text-ink-subtle"
                        title="The source published no share for this row and this portal cannot compute one"
                      >
                        —
                      </span>
                    ) : (
                      <div className="flex flex-col items-end gap-1">
                        <span
                          className={cn(
                            'figure-num text-xs',
                            computed ? 'text-ink-subtle' : 'text-ink-support',
                          )}
                          title={
                            computed
                              ? `Computed by this portal: this row ÷ the ${sheet.figures.length} rows listed in this section. BLGF published no share for it.`
                              : 'Share compiled alongside this row from the same source'
                          }
                        >
                          {computed ? '~' : ''}
                          {formatPercent(share, 2)}
                        </span>
                        <div className="hidden w-12 xs:block">
                          <Meter
                            value={share}
                            label={`${figure.label}: ${formatPercent(share, 2)} of the rows listed in this section`}
                          />
                        </div>
                      </div>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        {sheet.total != null && !totalRowPublished ? (
          <tfoot>
            <tr className="border-t border-rule-strong bg-surface-sunken">
              <th scope="row" className="py-2 pr-2 text-left align-top font-bold text-ink">
                Total as published
                <span className="mt-0.5 block text-[0.625rem] font-normal text-ink-subtle">
                  The source's own total cell, not a sum this portal computed
                </span>
              </th>
              <td className="py-2 pr-2 text-right align-top font-semibold whitespace-nowrap">
                {isRatio ? (
                  <span className="figure-num text-ink">{formatPercent(sheet.total, 2)}</span>
                ) : (
                  <Money value={sheet.total} className="text-ink" />
                )}
              </td>
              {isRatio ? null : <td className="py-2" />}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
