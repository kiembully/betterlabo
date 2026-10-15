import { formatPeso, formatPercent } from '@betterlabo/shared';

import { anchorOf, type WorkbookGroup } from './model';

function IndexList({
  groups,
  ordinals,
}: {
  groups: WorkbookGroup[];
  ordinals: Map<string, number>;
}) {
  return (
    <ul>
      {groups.map((group) => (
        <li key={group.key}>
          <p className="mt-3 mb-1 flex items-baseline justify-between gap-2 first:mt-0">
            <span className="text-[0.625rem] font-bold tracking-wider text-ink-subtle uppercase">
              {group.label}
            </span>
            <span className="figure-num text-[0.625rem] text-ink-subtle">
              {group.sheets.length}
            </span>
          </p>
          <ul className="space-y-px">
            {group.sheets.map((sheet) => (
              <li key={sheet.id}>
                <a
                  href={`#${anchorOf(sheet.id)}`}
                  className="flex items-baseline gap-2 rounded px-1.5 py-1 text-xs text-ink-support hover:bg-gray-100 hover:text-ink"
                >
                  <span className="figure-num w-5 shrink-0 text-right text-[0.625rem] text-ink-subtle">
                    {ordinals.get(sheet.id) ?? ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate" title={`${sheet.title} — ${sheet.basis}`}>
                    {sheet.title}
                  </span>
                  <span className="figure-num shrink-0 text-[0.625rem] text-ink-subtle">
                    {sheet.unit === '%'
                      ? formatPercent(sheet.total, 2)
                      : formatPeso(sheet.total, { compact: true })}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

/**
 * Two indexes of the same list: a disclosure list on a phone, a sticky rail on a
 * desktop. Both are plain anchors, so they work before any JavaScript runs and
 * survive being printed or opened from a shared link.
 */
export function SectionIndex({
  groups,
  ordinals,
  shown,
  total,
}: {
  groups: WorkbookGroup[];
  ordinals: Map<string, number>;
  shown: number;
  total: number;
}) {
  return (
    <>
      <details className="no-print card mb-3 lg:hidden">
        <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
          Jump to a section
          <span className="ml-2 text-xs font-normal text-ink-subtle">
            {shown} of {total} shown
          </span>
        </summary>
        <nav
          aria-label="Sections on this page"
          className="max-h-80 overflow-y-auto border-t border-rule px-3 py-2"
        >
          <IndexList groups={groups} ordinals={ordinals} />
        </nav>
      </details>

      <aside className="no-print card hidden p-4 lg:sticky lg:top-44 lg:block lg:max-h-[calc(100dvh-12rem)] lg:overflow-y-auto">
        <p className="text-[0.625rem] font-bold tracking-wider text-ink-subtle uppercase">
          Sections on this page
        </p>
        <p className="mt-1 text-xs text-ink-subtle">
          {shown} of {total} shown · grouped by the workbook they were compiled from
        </p>
        <nav aria-label="Sections on this page" className="mt-1">
          <IndexList groups={groups} ordinals={ordinals} />
        </nav>
      </aside>
    </>
  );
}
