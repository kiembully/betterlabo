import type { Metadata } from 'next';

import { DocumentBrowser } from '@/components/documents/document-browser';
import { Eyebrow } from '@/components/ui/primitives';
import { getLgu, getLguDocuments } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Published documents',
  description:
    "Every document the Municipal Government of Labo publishes under /docs/ — procurement notices, invitations to bid, requests for quotation and notices of award — indexed from the LGU's own website.",
};

export default async function DocumentsPage() {
  const [lgu, index] = await Promise.all([getLgu(), getLguDocuments()]);

  return (
    <div className="container-page py-12">
      <Eyebrow>Transparency</Eyebrow>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        Published documents
      </h1>
      <p className="mt-3 max-w-3xl text-base text-ink-support">
        The municipal government publishes its procurement paperwork — notices to proceed, notices
        of award, invitations to bid and requests for quotation — one page at a time on its own
        website, with no index. This is that index: {index ? index.count : '—'} documents, each
        linking straight to the published page.
      </p>

      <div className="mt-10">
        {index && index.count > 0 ? (
          <DocumentBrowser />
        ) : (
          <p className="text-sm text-ink-subtle">
            The document index has not been compiled yet. Run <code>npm run etl lgu</code> to build
            it.
          </p>
        )}
      </div>

      {lgu ? (
        <p className="mt-10 max-w-3xl text-xs leading-relaxed text-ink-subtle">
          Titles are derived from each page&rsquo;s address, because the site does not publish a
          separate machine-readable title; they are marked <code>titleDerived</code> in{' '}
          <code>/data/lgu-documents.json</code> rather than being presented as the document&rsquo;s
          own heading. Links open the live page on labo.gov.ph.
        </p>
      ) : null}
    </div>
  );
}
