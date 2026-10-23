import type { Metadata } from 'next';

import type { LguOfficial, LguRecord } from '@betterlabo/shared';

import {
  Chip,
  EmptyState,
  Eyebrow,
  ProvenanceRow,
  SectionHeading,
  StatTile,
} from '@/components/ui/primitives';
import { ETL_HINT, getLgu } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Officials and offices',
  description:
    "Who runs the Municipality of Labo, Camarines Norte — the mayor and vice mayor, the Sangguniang Bayan, and every department and section head with their office, floor and telephone number, compiled from the LGU's own website.",
};

/**
 * A person row. `name` is null whenever the page currently publishes only the
 * office — which, for the mayor and vice mayor, it does.
 */
function PersonRow({ person, index }: { person: LguOfficial; index: number }) {
  return (
    <tr className={index % 2 === 0 ? 'bg-surface' : 'bg-sunken'}>
      <td className="px-3 py-2.5 align-top text-sm font-semibold text-ink">
        {person.name ? (
          person.name
        ) : (
          <span className="font-normal text-ink-subtle italic">
            Not named on the current page
          </span>
        )}
        {person.nameRemovedFromCurrentPage && person.nameAsOf ? (
          <span className="mt-1 block text-xs font-normal text-ink-subtle">
            Last stated {person.nameAsOf}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 align-top text-sm text-ink-support">
        {person.position ?? '—'}
        {person.office ? (
          <span className="mt-0.5 block text-xs text-ink-subtle">{person.office}</span>
        ) : null}
      </td>
      <td className="px-3 py-2.5 align-top text-sm text-ink-support">
        {person.address ?? '—'}
        {person.floor ? (
          <span className="mt-0.5 block text-xs text-ink-subtle">{person.floor}</span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 align-top text-sm tabular-nums text-ink-support">
        {person.phone ?? '—'}
      </td>
    </tr>
  );
}

/**
 * One person, laid out as a card for phones. Four columns of names, positions,
 * offices and numbers cannot be read at 360px without scrolling sideways, and
 * the horizontal-scroll table is the one thing this directory had that the rest
 * of the portal had already dropped below `sm` (see the barangay directory and
 * the projects list).
 */
function PersonCard({ person }: { person: LguOfficial }) {
  return (
    <li className="card min-w-0 p-4">
      <p className="text-sm font-semibold break-words text-ink">
        {person.name ? (
          person.name
        ) : (
          <span className="font-normal text-ink-subtle italic">Not named on the current page</span>
        )}
      </p>
      {person.nameRemovedFromCurrentPage && person.nameAsOf ? (
        <p className="mt-0.5 text-xs text-ink-subtle">Last stated {person.nameAsOf}</p>
      ) : null}
      <p className="mt-1 text-sm break-words text-ink-support">{person.position ?? '—'}</p>
      {person.office ? (
        <p className="mt-0.5 text-xs leading-relaxed break-words text-ink-subtle">{person.office}</p>
      ) : null}
      {person.address ? (
        <p className="mt-1.5 text-xs leading-relaxed break-words text-ink-support">{person.address}</p>
      ) : null}
      {person.floor ? <p className="text-xs text-ink-subtle">{person.floor}</p> : null}
      <p className="mt-2 text-sm text-ink-support">
        <span className="text-xs font-semibold tracking-wide text-ink-subtle uppercase">
          Telephone{' '}
        </span>
        <span className="figure-num whitespace-nowrap">{person.phone ?? '—'}</span>
      </p>
    </li>
  );
}

function PersonTable({ people, caption }: { people: LguOfficial[]; caption: string }) {
  if (people.length === 0) return null;
  return (
    <>
      <ul className="grid gap-3 sm:hidden">
        {people.map((person, index) => (
          <PersonCard key={`${person.position}-${person.name ?? index}`} person={person} />
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-rule sm:block">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-rule bg-sunken">
              <th scope="col" className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
                Name
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
                Position
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
                Office and address
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-semibold tracking-wide text-ink-subtle uppercase">
                Telephone
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {people.map((person, index) => (
              <PersonRow key={`${person.position}-${person.name ?? index}`} person={person} index={index} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default async function OfficialsPage() {
  const lgu: LguRecord | null = await getLgu();

  if (!lgu) {
    return (
      <div className="container-page py-12">
        <Eyebrow>Local government</Eyebrow>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink">Officials and offices</h1>
        <div className="mt-8">
          <EmptyState
            title="The officials file has not been compiled yet"
            description="This page is built from the Municipality of Labo's own website, read through dated archive captures. Compile it with the ETL and it fills in."
            command={`${ETL_HINT}   # or: npm run etl lgu`}
          />
        </div>
      </div>
    );
  }

  const { officials, legislative, offices, snapshots } = lgu;
  /**
   * True when the current capture dropped the names — regardless of whether we
   * managed to recover them from an older capture. Testing for a NAMELESS entry
   * instead would hide the warning precisely when recovery succeeded, which is
   * when it matters most: the page would then show a real-looking name with only
   * a small footnote.
   */
  const executiveNamesMissing = officials.executive.some((e) => e.nameRemovedFromCurrentPage === true);
  const legislativeDates = legislative.asOf;
  const snap = (key: string) => snapshots[key];

  return (
    <div className="container-page py-12">
      <Eyebrow>Local government</Eyebrow>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        Officials and offices
      </h1>
      <p className="mt-3 max-w-3xl text-base text-ink-support">
        The people who run the Municipality of Labo and the offices they hold, compiled from the
        municipal government&rsquo;s own website. Every section records the date of the
        archived page it was read from, because this page changes.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Executive offices" value={String(officials.counts.executiveOffices)} />
        <StatTile label="Department heads" value={String(officials.counts.departmentHeads)} />
        <StatTile label="Section heads" value={String(officials.counts.sectionHeads)} />
        <StatTile label="Sangguniang Bayan" value={String(legislative.counts.total)} />
      </div>

      {/*
        The most important editorial call on this page. The municipality's site
        stopped publishing the names of its mayor and vice mayor, so this portal
        shows the office, says plainly that no name is published, and dates the
        last one it did publish rather than presenting it as current.
      */}
      {executiveNamesMissing ? (
        <div
          role="note"
          className="mt-8 rounded-card border border-warn-200 bg-warn-50 p-4 text-sm text-ink-support"
        >
          <p className="font-semibold text-ink">
            The municipal website does not currently publish the names of the mayor or the vice mayor.
          </p>
          <p className="mt-1.5">
            The archived page from {snap('officials')?.date ?? 'the latest capture'} lists only the
            offices of the mayor and the vice mayor. Names shown below are the last ones that page
            stated, dated {officials.executive.find((e) => e.nameAsOf)?.nameAsOf ?? '—'}, and are
            labelled as such. Treat them as historical, not as the incumbent roster.
          </p>
        </div>
      ) : null}

      <section className="mt-12">
        <SectionHeading
          title="Executive"
          description="The mayor and vice mayor, as published by the Municipal Government."
        />
        <div className="mt-5">
          <PersonTable people={officials.executive} caption="Municipal mayor and vice mayor" />
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          title="Sangguniang Bayan"
          description="The municipal legislature. Ex-officio members sit by virtue of another office they hold."
        />
        <p className="mt-4 max-w-3xl text-sm text-ink-support">{legislative.note}</p>
        <div className="mt-5 overflow-hidden rounded-card border border-rule">
          <ul className="divide-y divide-rule">
            {legislative.members.map((member) => (
              <li
                key={member.name}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-ink">{member.name}</p>
                  <p className="text-xs text-ink-subtle">
                    {member.role ?? 'Member'}
                    {member.exOfficioBody ? ` · ${member.exOfficioBody}` : ''}
                  </p>
                </div>
                <Chip tone={member.kind === 'vice-mayor' ? 'brand' : member.kind === 'ex-officio' ? 'default' : 'good'}>
                  {member.kind === 'vice-mayor'
                    ? 'Presiding officer'
                    : member.kind === 'ex-officio'
                      ? 'Ex-officio'
                      : 'Elected'}
                </Chip>
              </li>
            ))}
            {legislative.vacantSeats.map((seat) => (
              <li key={seat.label} className="flex items-center justify-between px-4 py-3">
                <p className="text-sm text-ink-subtle italic">
                  No member named for {seat.body}
                </p>
                <Chip tone="warn">Vacant on the page</Chip>
              </li>
            ))}
          </ul>
        </div>
        {legislativeDates ? (
          <p className="mt-2 text-xs text-ink-subtle">
            Roster as published {legislativeDates}.
          </p>
        ) : null}
      </section>

      <section className="mt-12">
        <SectionHeading
          title="Department heads"
          description="Appointed heads of the municipal departments, with the office and telephone number the LGU publishes."
        />
        <div className="mt-5">
          <PersonTable people={officials.departmentHeads} caption="Municipal department heads" />
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          title="Section heads"
          description="Heads of the sections and special units inside those departments."
        />
        <div className="mt-5">
          <PersonTable people={officials.sectionHeads} caption="Municipal section heads" />
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          title="Office directory"
          description="Where to go, by cluster. The LGU groups its departments into five clusters; the address includes the barangay."
        />
        <p className="mt-4 max-w-3xl text-sm text-ink-support">{offices.note}</p>
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {offices.byCluster.map((group) => (
            <div key={group.cluster} className="rounded-card border border-rule p-4">
              <h3 className="text-sm font-bold tracking-tight text-ink">
                {group.name ?? group.cluster}
              </h3>
              <p className="mt-1 text-xs text-ink-subtle">
                {group.officeCount} office{group.officeCount === 1 ? '' : 's'}
                {group.snapshot?.date ? ` · as published ${group.snapshot.date}` : ''}
              </p>
              {offices.clusters.find((c) => c.slug === group.cluster)?.description ? (
                <p className="mt-2 text-xs text-ink-support">
                  {offices.clusters.find((c) => c.slug === group.cluster)?.description}
                </p>
              ) : null}
              <ul className="mt-3 space-y-2.5">
                {group.offices.map((office) => (
                  <li key={office.name}>
                    <p className="text-sm font-medium text-ink">{office.name}</p>
                    <p className="text-xs text-ink-subtle">{office.address}</p>
                  </li>
                ))}
                {group.offices.length === 0 ? (
                  <li className="text-xs text-ink-subtle italic">
                    No offices compiled from this cluster page{group.note ? ` — ${group.note}` : ''}.
                  </li>
                ) : null}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <SectionHeading
          title="Where this comes from"
          description="The municipal website sits behind a bot challenge, so the pages are read from dated archive captures. Each link goes to the exact capture used."
        />
        <dl className="mt-5 divide-y divide-rule rounded-card border border-rule">
          {[
            ['Executive and department heads', snap('officials')],
            ['Executive names, last stated', snap('executiveNames')],
            ['Sangguniang Bayan', snap('legislative')],
            ['Municipal profile', snap('facts')],
            ['Departments and clusters', snap('departments')],
          ].map(([label, ref]) => (
            <div key={String(label)} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
              <dt className="text-sm font-medium text-ink">{String(label)}</dt>
              <dd className="text-sm text-ink-support">
                {ref && typeof ref === 'object' && 'url' in ref ? (
                  <>
                    <a
                      className="link"
                      href={(ref as { url: string }).url}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      Archived capture
                    </a>
                    {(ref as { date?: string | null }).date ? (
                      <span className="text-ink-subtle"> · {(ref as { date?: string | null }).date}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-ink-subtle">Not captured in this run</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <ProvenanceRow
            items={[
              { label: 'Source', value: lgu.source.name, tone: 'brand' },
              { label: 'Publisher', value: lgu.source.publisher },
              { label: 'Licence', value: lgu.source.license },
              {
                label: 'Read via',
                value: (
                  <a className="link" href={lgu.source.url} target="_blank" rel="noreferrer noopener">
                    labo.gov.ph
                  </a>
                ),
              },
            ]}
          />
        </div>
        <p className="mt-3 max-w-3xl text-xs text-ink-subtle">{lgu.source.accessedVia}</p>
      </section>
    </div>
  );
}
