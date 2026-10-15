import Link from 'next/link';

import { formatArea, formatNumber } from '@betterlabo/shared';

import { DefRow, Eyebrow, SectionHeading } from '@/components/ui/primitives';
import { getBarangayIndex, getProfile } from '@/lib/data';
import { EMERGENCY_NOTICE, INDEPENDENCE_NOTICE, SITE } from '@/lib/site';

export const metadata = {
  title: 'About',
  description:
    'What BetterLabo is, who builds it, the method behind every figure, and what it deliberately does not do.',
};

const PRINCIPLES = [
  {
    title: 'Serverless and static-first',
    body: 'The public portal is a Next.js app that renders from cached JSON. There is no always-on server behind a page view, so hosting costs nothing to keep running and a traffic spike cannot take it down.',
  },
  {
    title: 'Compiled, not scraped live',
    body: 'Every dataset is fetched by a scheduled ETL, reduced to the part about Labo, and written to a static file with its provenance recorded. No page you open ever scrapes a government website while you wait.',
  },
  {
    title: 'Provenance on every number',
    body: 'Each figure traces to a named workbook, sheet, row and column range, with the retrieval date and the source licence. The registry is public at /data.',
  },
  {
    title: 'Missing data stays missing',
    body: 'A field with no verified source is shown as pending, never filled with a plausible-looking number. A blank cell in the source is published as null, not as zero.',
  },
  {
    title: 'Non-partisan by construction',
    body: 'The portal has no commentary on officials, candidates or parties. It publishes what the records say and links to them so a reader can disagree with our reading.',
  },
] as const;

export default async function AboutPage() {
  const [profile, index] = await Promise.all([getProfile(), getBarangayIndex()]);

  return (
    <div className="container-page py-12">
      <SectionHeading
        eyebrow="About"
        title="An independent public record for Labo"
        description={`${SITE.name} is a community-built transparency portal for the Municipality of Labo, Camarines Norte, following the BetterGov.ph BetterLGU Playbook. It is maintained by volunteers, not by the municipal government.`}
      />

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid gap-4">
          {PRINCIPLES.map((p) => (
            <section key={p.title} className="card p-5">
              <h2 className="text-base font-bold text-ink">{p.title}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-support">{p.body}</p>
            </section>
          ))}
        </div>

        <aside className="grid content-start gap-4">
          <div className="card p-5">
            <Eyebrow>Municipal profile</Eyebrow>
            <dl className="mt-3">
              <DefRow term="Official name">{profile?.officialName ?? '—'}</DefRow>
              <DefRow term="PSGC code">
                <span className="figure-num">{profile?.psgcCode ?? '0501606000'}</span>
              </DefRow>
              <DefRow term="Province">{profile?.province ?? 'Camarines Norte'}</DefRow>
              <DefRow term="Region">{profile?.region ?? 'Region V (Bicol Region)'}</DefRow>
              <DefRow term="Barangays">
                {profile ? formatNumber(profile.barangayCount) : '—'}
              </DefRow>
              <DefRow term="Land area">{formatArea(profile?.areaSqKm ?? null)}</DefRow>
              <DefRow term="Income class">
                {profile?.incomeClass ?? (
                  <span className="text-ink-subtle">
                    Pending — the brief states 1st class; no classification source is wired into the
                    ETL yet, so nothing is asserted here.
                  </span>
                )}
              </DefRow>
              <DefRow term="Population">
                <span className="text-ink-subtle">
                  Pending — no barangay-level PSA census extract is published as a dataset. Place an
                  official file at <code className="figure-num">data/sources/psa-population.csv</code>{' '}
                  to attach it.
                </span>
              </DefRow>
            </dl>
          </div>

          <div className="card p-5">
            <Eyebrow>How the map is built</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-ink-support">
              Barangay polygons come from the Philippine Barangay Boundaries hierarchical GeoJSON
              release (PSA PSGC 2023-10-24 codes stamped on NAMRIA 2023-11-06 boundary shapes).
              Labo&rsquo;s figures are selected by the municipal PSGC code{' '}
              <span className="figure-num">PH0501606</span>
              {index ? `, which yields exactly ${index.count} barangays` : ''}. Areas are the
              upstream values, not recomputed here.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-support">
              Hazard layers are clipped from the Project NOAH Camarines Norte archives, keeping only
              the polygons that fall inside the municipal outline. A barangay is marked as exposed
              when a mapped hazard patch lies inside its boundary — see{' '}
              <Link href="/map" className="font-semibold text-brand-700 underline">
                the map
              </Link>{' '}
              for the per-layer status.
            </p>
          </div>

          <div className="card border-accent-orange-200 bg-accent-orange-50 p-5">
            <Eyebrow>Not an emergency channel</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed text-accent-orange-700">{EMERGENCY_NOTICE}</p>
          </div>
        </aside>
      </div>

      <section className="mt-12 card p-6">
        <Eyebrow>Independence</Eyebrow>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-support">
          {INDEPENDENCE_NOTICE}
        </p>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-ink-support">
          The project follows the deployment, open-source and content standards in the BetterGov.ph{' '}
          <a
            href="https://lgu.bettergov.ph/GUIDE"
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-brand-700 underline"
          >
            BetterLGU guide
          </a>
          , and draws its data from the{' '}
          <a
            href="https://data.bettergov.ph"
            target="_blank"
            rel="noreferrer noopener"
            className="font-semibold text-brand-700 underline"
          >
            BetterGov.ph Open Data Portal
          </a>
          . Corrections are welcome: an error in a figure is a bug, not a matter of opinion.
        </p>
      </section>
    </div>
  );
}
