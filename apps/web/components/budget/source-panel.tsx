import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatNumber,
} from '@betterlabo/shared';
import type { DatasetProvenance, FiscalSnapshot } from '@betterlabo/shared';

import {
  Chip,
  DefRow,
  Eyebrow,
  ProvenanceRow,
  SectionHeading,
} from '@/components/ui/primitives';

interface Props {
  snapshot: FiscalSnapshot;
  dataset: DatasetProvenance | null;
  /** Registry compile time, when the registry is available. */
  registryGeneratedAt: string | null;
  sectionCount: number;
  figureCount: number;
}

/**
 * Where the numbers came from, in the registry's own words: publisher, licence,
 * retrieval date, row count, checksum and the exact workbooks behind the file.
 * Nothing on this panel is typed by hand — it is the datasets registry entry
 * that produced fiscal.json.
 */
export function SourcePanel({
  snapshot,
  dataset,
  registryGeneratedAt,
  sectionCount,
  figureCount,
}: Props) {
  const outputs = dataset?.outputs ?? [];
  const workbooks = outputs.filter((output) => output.startsWith('BLGF'));
  const files = outputs.filter((output) => !output.startsWith('BLGF'));

  return (
    <section className="container-page pt-14">
      <SectionHeading
        eyebrow="Provenance"
        title="Where every figure on this page came from"
        description="Four per-LGU workbooks published by the Bureau of Local Government Finance, one row selected for Labo, Camarines Norte, compiled at build time into a single JSON file this page reads."
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
        <div className="card p-5">
          <Eyebrow>Dataset</Eyebrow>
          <h3 className="mt-2 text-base font-bold text-ink">
            {dataset ? dataset.title : 'Source registry entry not available'}
          </h3>
          {dataset ? (
            <>
              <p className="mt-1 text-xs text-ink-support">{dataset.publisher}</p>
              <dl className="mt-3">
                <DefRow term="Dataset page">
                  <a
                    href={dataset.portalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-700 underline"
                  >
                    {dataset.portalUrl} ↗
                  </a>
                </DefRow>
                <DefRow term="Workbook">
                  <a
                    href={dataset.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-brand-700 underline"
                  >
                    {dataset.sourceUrl.split('/').pop() ?? dataset.sourceUrl} ↗
                  </a>
                  <span className="mt-0.5 block font-mono text-[0.625rem] break-all text-ink-subtle">
                    {dataset.sourceUrl}
                  </span>
                </DefRow>
                <DefRow term="Licence">
                  {dataset.licenseUrl ? (
                    <a
                      href={dataset.licenseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-brand-700 underline"
                    >
                      {dataset.license}
                    </a>
                  ) : (
                    dataset.license
                  )}
                </DefRow>
                <DefRow term="Source version">{dataset.sourceVersion ?? '—'}</DefRow>
                <DefRow term="Retrieved">
                  {formatDate(dataset.retrievedAt)}
                  <span className="ml-2 text-xs text-ink-subtle">
                    {formatDateTime(dataset.retrievedAt)}
                  </span>
                </DefRow>
                <DefRow term="Rows in source workbook">
                  {dataset.rowCount != null
                    ? `${formatNumber(dataset.rowCount)} rows across the four workbooks`
                    : '—'}
                </DefRow>
                <DefRow term="Download size">
                  {dataset.bytes != null ? `${formatBytes(dataset.bytes)} combined` : '—'}
                </DefRow>
                <DefRow term="Checksum">
                  {dataset.sha256 ? (
                    <span
                      className="block font-mono text-[0.625rem] break-all text-ink-support"
                      title="sha256 of the Statement of Receipts and Expenditures workbook"
                    >
                      {dataset.sha256}
                    </span>
                  ) : (
                    '—'
                  )}
                </DefRow>
                {dataset.notes ? <DefRow term="Notes">{dataset.notes}</DefRow> : null}
              </dl>
              <p className="mt-3 border-t border-rule pt-3 text-[0.625rem] leading-relaxed text-ink-subtle">
                {dataset.attributionText}
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-ink-support">
              fiscal.json exists but the datasets registry does not describe it, so this page cannot
              link the workbook it came from. Run the ETL’s datasets task to restore the registry.
            </p>
          )}
        </div>

        <div>
          <div className="card p-5">
            <Eyebrow>Compiled file</Eyebrow>
            <h3 className="mt-2 text-base font-bold text-ink">FY {snapshot.fiscalYear} fiscal snapshot</h3>
            <dl className="mt-3">
              <DefRow term="Municipality">
                {snapshot.municipality}
                <span className="ml-2 font-mono text-[0.625rem] text-ink-subtle">
                  PSGC {snapshot.municipalityPsgcCode}
                </span>
              </DefRow>
              <DefRow term="Status">
                <Chip tone={snapshot.preliminary ? 'warn' : 'good'}>
                  {snapshot.preliminary ? 'Preliminary' : 'Final'}
                </Chip>
              </DefRow>
              <DefRow term="Sections compiled">
                {formatNumber(sectionCount)} sections · {formatNumber(figureCount)} published rows
              </DefRow>
              <DefRow term="Compiled">
                {formatDate(snapshot.generatedAt)}
                {registryGeneratedAt ? (
                  <span className="ml-2 text-xs text-ink-subtle">
                    registry rebuilt {formatDate(registryGeneratedAt)}
                  </span>
                ) : null}
              </DefRow>
              <DefRow term="Declared sources">
                <span className="flex flex-wrap gap-1">
                  {snapshot.sources.length > 0
                    ? snapshot.sources.map((source) => (
                        <code
                          key={source}
                          className="rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.625rem] text-ink-support"
                        >
                          {source}
                        </code>
                      ))
                    : '—'}
                </span>
              </DefRow>
              {files.length > 0 ? (
                <DefRow term="Output file">
                  {files.map((file) => (
                    <code
                      key={file}
                      className="block font-mono text-[0.625rem] break-all text-ink-support"
                    >
                      {file}
                    </code>
                  ))}
                </DefRow>
              ) : null}
            </dl>
            <div className="mt-3 border-t border-rule pt-3">
              <ProvenanceRow
                items={[
                  {
                    label: 'Sections',
                    value: formatNumber(sectionCount),
                  },
                  { label: 'Rows', value: formatNumber(figureCount) },
                  {
                    label: 'Status',
                    value: snapshot.preliminary ? 'Preliminary' : 'Final',
                    tone: snapshot.preliminary ? 'warn' : 'default',
                  },
                ]}
              />
            </div>
          </div>

          {workbooks.length > 0 ? (
            <div className="card mt-4 p-5">
              <Eyebrow>Workbooks behind this file</Eyebrow>
              <ul className="mt-2 grid gap-1.5">
                {workbooks.map((workbook) => (
                  <li
                    key={workbook}
                    className="border-b border-rule pb-1.5 text-xs leading-relaxed text-ink-support last:border-b-0"
                  >
                    {workbook}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.625rem] leading-relaxed text-ink-subtle">
                The registry records one download URL — the Statement of Receipts and Expenditures
                workbook — and the checksum above is of that file. The other three workbooks come
                from the same BLGF portal dataset.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="card mt-4 border-accent-orange-200 bg-accent-orange-50 p-5">
        <p className="text-[0.6875rem] font-bold tracking-wider text-accent-orange-700 uppercase">
          Preliminary — read the totals as provisional
        </p>
        <p className="mt-2 text-xs leading-relaxed text-accent-orange-700">{snapshot.note}</p>
      </div>
    </section>
  );
}
