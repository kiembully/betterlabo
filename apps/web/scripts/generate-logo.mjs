/**
 * Generate the BetterLabo emblem from the compiled municipal boundary.
 *
 * The silhouette is the REAL outline of the Municipality of Labo, taken from
 * `apps/web/public/data/labo-municipality.geojson` (PSA PSGC + NAMRIA, compiled by
 * the ETL). Tracing the DTI/CMCI seal would have meant hand-drawing a boundary and
 * getting it subtly wrong; deriving it means the shape is the actual municipality,
 * and it regenerates whenever the boundary source is refreshed.
 *
 * Palette deliberately matches the convention the reference uses — the Philippine
 * national blue and gold — because a civic portal should look like it belongs to
 * the same family of government sites, without copying anyone's letterforms or
 * artwork. The wordmark stays as real HTML text in the header and is NOT drawn here.
 *
 * Writes:
 *   apps/web/components/brand/labo-mark.tsx   inline SVG, no extra network request
 *   apps/web/app/icon.svg                     the favicon Next serves automatically
 *
 * Run: node apps/web/scripts/generate-logo.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const geojsonPath = join(webRoot, 'public', 'data', 'labo-municipality.geojson');

const NAVY = '#0032a0';
const GOLD = '#f2c91d';

/** Every ring of the municipal polygon(s), as [lng, lat] pairs. */
function municipalRings() {
  const parsed = JSON.parse(readFileSync(geojsonPath, 'utf8'));
  const rings = [];
  for (const feature of parsed.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const polygons =
      geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) rings.push(ring);
  }
  if (rings.length === 0) throw new Error(`No polygon rings found in ${geojsonPath}`);
  return rings;
}

/**
 * Project lng/lat to SVG coordinates.
 *
 * Longitude is scaled by cos(centre latitude) — without it the municipality is
 * stretched horizontally by roughly 3% at 14°N, which is small enough to look like
 * a mistake and large enough to be one.
 */
function project(rings, width, height, padding) {
  const points = rings.flat();
  const lats = points.map(([, lat]) => lat);
  const lngs = points.map(([lng]) => lng);
  const centreLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((centreLat * Math.PI) / 180);

  const xs = lngs.map((lng) => lng * kx);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...lats);
  const maxY = Math.max(...lats);

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const scale = Math.min(innerW / (maxX - minX), innerH / (maxY - minY));
  const offsetX = padding + (innerW - (maxX - minX) * scale) / 2;
  const offsetY = padding + (innerH - (maxY - minY) * scale) / 2;

  const round = (n) => Math.round(n * 100) / 100;
  return rings
    .map(
      (ring) =>
        `${ring
          .map(([lng, lat], index) => {
            const x = round(offsetX + (lng * kx - minX) * scale);
            // SVG y grows downward, latitude grows upward.
            const y = round(offsetY + (maxY - lat) * scale);
            return `${index === 0 ? 'M' : 'L'}${x} ${y}`;
          })
          .join('')}Z`,
    )
    .join('');
}

const rings = municipalRings();
/**
 * The badge is deliberately NOT square.
 *
 * Labo's boundary is ~1.96:1 wide once longitude is corrected for latitude, so a
 * circular or square badge leaves the silhouette as a thin band floating in empty
 * blue — still a closed shape, but illegible at the 36px the masthead uses. A
 * rounded rectangle at the landmass's own proportions lets the shape fill the
 * field. A circle was also rejected on meaning: it reads as a globe or a seal,
 * which is a claim about what this is that is not true.
 */
const WIDTH = 64;
const HEIGHT = 36;
const CORNER = 7;
const badgePath = project(rings, WIDTH, HEIGHT, 3.5);

/* ── 1. app/icon.svg — the favicon Next emits a <link rel="icon"> for ---------- */
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="BetterLabo">
  <rect width="${WIDTH}" height="${HEIGHT}" rx="${CORNER}" fill="${NAVY}"/>
  <path d="${badgePath}" fill="${GOLD}"/>
</svg>
`;
writeFileSync(join(webRoot, 'app', 'icon.svg'), icon, 'utf8');

/* ── 2. the inline React mark used in the header ------------------------------ */
const component = `/**
 * The BetterLabo emblem — the actual outline of the Municipality of Labo.
 *
 * GENERATED FILE. Do not hand-edit: run \`node apps/web/scripts/generate-logo.mjs\`,
 * which derives the path from the compiled municipal boundary
 * (public/data/labo-municipality.geojson) so the silhouette is the real
 * municipality rather than a traced approximation, and re-derives it whenever the
 * boundary source is refreshed.
 *
 * Inline rather than an <img>: no extra request, and it inherits sizing from
 * whatever it is dropped into. The wordmark beside it is real HTML text.
 */
export function LaboMark({
  className,
  title = 'BetterLabo',
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 ${WIDTH} ${HEIGHT}"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="${WIDTH}" height="${HEIGHT}" rx="${CORNER}" fill="${NAVY}" />
      <path d="${badgePath}" fill="${GOLD}" />
    </svg>
  );
}
`;
mkdirSync(join(webRoot, 'components', 'brand'), { recursive: true });
writeFileSync(join(webRoot, 'components', 'brand', 'labo-mark.tsx'), component, 'utf8');

console.log(`rings: ${rings.length}, points: ${rings.reduce((n, r) => n + r.length, 0)}`);
console.log(`badge: ${WIDTH}x${HEIGHT}, corner ${CORNER}`);
console.log('wrote apps/web/app/icon.svg');
console.log('wrote apps/web/components/brand/labo-mark.tsx');
console.log(`\nbadge path (${badgePath.length} chars):\n${badgePath.slice(0, 220)}…`);
