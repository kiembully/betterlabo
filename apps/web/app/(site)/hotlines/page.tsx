import type { Metadata } from 'next';

import { HotlineBoard } from '@/components/services/hotline-board';
import { EmptyState, SectionHeading } from '@/components/ui/primitives';
import { ETL_HINT, getHotlines } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Emergency contacts',
  description:
    'MDRRMO, fire, police, health and municipal numbers for Labo, Camarines Norte — each with the source it was read from.',
};

export default async function HotlinesPage() {
  const board = await getHotlines();

  return (
    <div className="container-page py-14">
      <SectionHeading
        as="h1"
        eyebrow="Public safety"
        title="Emergency contacts"
        description="Disaster response, fire, police, health and municipal numbers for Labo. Each one names the source it was read from, and every disagreement between official sources is shown rather than smoothed over."
      />

      <div className="mt-8 max-w-4xl">
        {board ? (
          <HotlineBoard board={board} />
        ) : (
          <EmptyState
            title="The hotline list has not been compiled on this deployment."
            description="These numbers are curated from published government sources. Run the ETL to compile them."
            command={ETL_HINT}
          />
        )}
      </div>
    </div>
  );
}
