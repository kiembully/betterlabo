import { ImageResponse } from 'next/og';

import { LABO_MARK_SIZE, LABO_MARK_URI } from '@/components/brand/labo-mark-uri';
import { getBarangayIndex } from '@/lib/data';
import { SITE } from '@/lib/site';

/**
 * The social card, generated at build time by `next/og` (satori) so a shared link is
 * legible on Facebook, Messenger, X, Viber and LinkedIn — which is how most residents
 * will meet this portal.
 *
 * The emblem is the SAME artwork as the masthead and the favicon: `labo-mark-uri.ts` is
 * written by `generate-logo.mjs` from the compiled municipal boundary, so the card
 * cannot drift from the mark. satori cannot import a React component, which is why the
 * mark also exists as a data URI.
 *
 * The barangay count is READ from the compiled index rather than written into a string:
 * a card is the one piece of copy nobody re-reads after a data refresh, so a hard-coded
 * "52" would quietly become a false claim the day the boundary source changes.
 *
 * No custom font is loaded: the card uses satori's built-in sans, and shipping a webfont
 * into a metadata route for one image is not worth the bundle.
 */
export const alt = `${SITE.name} — ${SITE.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const MARK_HEIGHT = 132;

export default async function OpengraphImage() {
  const barangays = await getBarangayIndex();
  const markWidth = Math.round((LABO_MARK_SIZE.width / LABO_MARK_SIZE.height) * MARK_HEIGHT);
  const coverage =
    barangays && barangays.count > 0
      ? `All ${barangays.count} barangays on a map, local fiscal data from BLGF, and hazard layers from Project NOAH.`
      : 'Barangays on a map, local fiscal data from BLGF, and hazard layers from Project NOAH.';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: '#ffffff',
          padding: '68px 76px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '26px' }}>
          <img src={LABO_MARK_URI} width={markWidth} height={MARK_HEIGHT} alt="" />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              fontSize: 30,
              color: '#6f7c88',
              lineHeight: 1.25,
            }}
          >
            <span>Labo, Camarines Norte</span>
            <span>Municipal transparency portal</span>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 'auto' }}>
          <div
            style={{
              display: 'flex',
              fontSize: 104,
              fontWeight: 700,
              letterSpacing: '-2px',
              color: '#062365',
              lineHeight: 1,
            }}
          >
            {SITE.name}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: '22px',
              maxWidth: '940px',
              fontSize: 38,
              lineHeight: 1.32,
              color: '#596570',
            }}
          >
            {coverage}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '18px', marginTop: '38px' }}>
            <div
              style={{ display: 'flex', width: '96px', height: '8px', backgroundColor: '#f2c91d' }}
            />
            <div style={{ display: 'flex', fontSize: 30, fontWeight: 600, color: '#0032a0' }}>
              {SITE.domain}
            </div>
            <div style={{ display: 'flex', fontSize: 28, color: '#6f7c88' }}>
              · Free to use · No paywall
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
