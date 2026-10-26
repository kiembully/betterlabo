/**
 * Generate the BetterLabo emblem: the Municipality of Labo in national blue, with
 * the Philippine sun rising behind it.
 *
 * The silhouette is the REAL outline of the Municipality of Labo, taken from
 * `apps/web/public/data/labo-municipality.geojson` (PSA PSGC + NAMRIA, compiled by
 * the ETL). Tracing a raster or the DTI/CMCI seal would mean hand-drawing a boundary
 * and getting it subtly wrong; deriving it means the shape is the actual
 * municipality, and it regenerates whenever the boundary source is refreshed.
 *
 * WHY THIS COMPOSITION
 *
 * The reference supplied for this project shows a land mass with the sun breaking over
 * its upper-right edge. That also fixes a real problem rather than decorating one —
 * Labo is ~1.96:1 wide once longitude is corrected for latitude, so inside a circle
 * the silhouette collapses into a thin band floating in empty space. Here it fills the
 * width and the sun's fan of rays occupies the sky above it.
 *
 * The proportions are MEASURED from that reference (680x554), not eyeballed:
 *   - disc radius            = 0.122 x land width
 *   - disc centre            = ON the land's top edge, i.e. the visible sun is a
 *                              half-disc; this is the whole "rising" reading. A disc
 *                              tucked only a little looks like a full sun floating
 *                              above the land — which is exactly what the first
 *                              attempt at this mark did.
 *   - cardinal ray reach     = 2.35 x disc radius, diagonal = 2.1
 *   - rays start at the disc edge; a gap there reads as a detached wheel of spokes
 *
 * Rays keep the flag's construction: eight directions, each split into two tapering
 * blades, with the cardinal (N/E/S/W) rays reaching further than the diagonals. Every
 * ray below the land's edge falls behind the silhouette.
 *
 * The canvas is FITTED to the artwork rather than being a fixed 64-unit square, so the
 * mark carries no dead sky and the wide land plus a half-sun keep their true aspect.
 *
 * Palette is the national blue and gold. No artwork or letterforms are copied.
 *
 * Writes:
 *   apps/web/components/brand/labo-mark.tsx   inline SVG, no extra network request
 *   apps/web/components/brand/labo-mark-uri.ts the same mark as a data URI, for the
 *                                             generated social card (next/og cannot
 *                                             read a component)
 *   apps/web/app/icon.svg                     the favicon Next serves automatically
 *   tools/etl/.cache/logo-preview.html        a size ladder, for looking at it
 *
 * Run: node apps/web/scripts/generate-logo.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const geojsonPath = join(webRoot, 'public', 'data', 'labo-municipality.geojson');
const cacheDir = join(webRoot, '..', '..', 'tools', 'etl', '.cache');

const NAVY = '#0032a0';
const GOLD = '#f2c91d';

/** Land width in working units. Everything else is derived from it. */
const LAND_W = 58;
/** White keyline around the silhouette: what separates land from sun. */
const KEYLINE = 1.7;
/** Clear space kept around the artwork when the canvas is fitted to it. */
const PAD = 0.8;

/** Where the sun sits along the land: 0 = west edge, 1 = east edge. */
const SUN_AT = 0.78;
/** Measured from the reference: disc radius / land width. */
const DISC_R = LAND_W * 0.122;
/** Disc centre sits this far ABOVE the land's edge there — on it, in practice. */
const DISC_ABOVE_EDGE = 0.05 * DISC_R;
const RAY_INNER = DISC_R - 0.5;
const RAY_OUTER_CARDINAL = DISC_R * 2.35;
const RAY_OUTER_DIAGONAL = DISC_R * 2.1;
/**
 * Half-width of a blade, in degrees, measured at the disc edge. Blades taper outward.
 *
 * These two numbers carry the whole look. An earlier composition used a 1.6 degree gap
 * and 5.2 degree blades, and the two blades of each ray fused into a single spike — the
 * mark read as twelve lone rays rather than the flag's eight split rays. The gap has to
 * be wide enough to survive at 36px, which is the size the masthead actually uses.
 */
const BLADE_SPREAD = 7.0;
/** Gap between the two blades of one ray, in degrees. */
const BLADE_GAP = 4.4;

const round = (n) => Math.round(n * 100) / 100;

function polar(cx, cy, radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
}

/** The flag's sun: eight rays, each two tapering blades, cardinals reaching further. */
function sunBlades(cx, cy) {
  const blades = [];
  for (let index = 0; index < 8; index += 1) {
    const bearing = index * 45;
    const outer = bearing % 90 === 0 ? RAY_OUTER_CARDINAL : RAY_OUTER_DIAGONAL;
    for (const side of [1, -1]) {
      const near = polar(cx, cy, RAY_INNER, bearing + side * BLADE_GAP);
      const far = polar(cx, cy, RAY_INNER, bearing + side * (BLADE_GAP + BLADE_SPREAD));
      const tip = polar(cx, cy, outer, bearing + side * (BLADE_GAP + BLADE_SPREAD / 2));
      blades.push({ near, far, tip });
    }
  }
  return blades;
}

/** Every ring of the municipal polygon(s), as [lng, lat] pairs. */
function municipalRings() {
  const parsed = JSON.parse(readFileSync(geojsonPath, 'utf8'));
  const rings = [];
  for (const feature of parsed.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) for (const ring of polygon) rings.push(ring);
  }
  if (rings.length === 0) throw new Error(`No polygon rings found in ${geojsonPath}`);
  return rings;
}

/**
 * Project lng/lat into the land box: fitted by width, aspect preserved, top at y=0.
 *
 * Longitude is scaled by cos(centre latitude) — without it the municipality is
 * stretched ~3% at 14 degrees north, small enough to look like a mistake and large
 * enough to be one.
 *
 * Returns the projected rings too, so the caller can find where the land's upper edge
 * crosses the sun's column and stand the sun ON it, instead of guessing a y offset that
 * only holds until the boundary is refreshed.
 */
function projectLand(rings, width) {
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

  const scale = width / (maxX - minX);
  // SVG y grows downward, latitude grows upward.
  const projected = rings.map((ring) =>
    ring.map(([lng, lat]) => [(lng * kx - minX) * scale, (maxY - lat) * scale]),
  );

  const path = projected
    .map(
      (ring) =>
        `${ring
          .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`)
          .join('')}Z`,
    )
    .join('');

  return { path, projected, height: (maxY - minY) * scale };
}

/** The highest point of the land in the column `x`, by scanning every edge. */
function topEdgeAt(projected, x) {
  let best = Infinity;
  for (const ring of projected) {
    for (let index = 0; index < ring.length; index += 1) {
      const [x1, y1] = ring[index];
      const [x2, y2] = ring[(index + 1) % ring.length];
      const lo = Math.min(x1, x2);
      const hi = Math.max(x1, x2);
      if (x < lo || x > hi) continue;
      const t = hi === lo ? 0 : (x - x1) / (x2 - x1);
      best = Math.min(best, y1 + (y2 - y1) * t);
    }
  }
  return best;
}

const rings = municipalRings();
const land = projectLand(rings, LAND_W);
const sunX = LAND_W * SUN_AT;
const edge = topEdgeAt(land.projected, sunX);
if (!Number.isFinite(edge)) throw new Error(`No land edge at x=${sunX}`);
const sunY = edge - DISC_ABOVE_EDGE;
const blades = sunBlades(sunX, sunY);

// Fit the canvas to the artwork: no dead sky, and the sun's eastward ray is never
// clipped by a fixed square the way it is in the reference raster.
const xs = [0, LAND_W, sunX - DISC_R, sunX + DISC_R];
const ys = [0, land.height, sunY - DISC_R, sunY + DISC_R];
for (const { near, far, tip } of blades) {
  for (const [x, y] of [near, far, tip]) {
    xs.push(x);
    ys.push(y);
  }
}
const box = {
  x: round(Math.min(...xs) - PAD),
  y: round(Math.min(...ys) - PAD),
  w: round(Math.max(...xs) - Math.min(...xs) + PAD * 2),
  h: round(Math.max(...ys) - Math.min(...ys) + PAD * 2),
};
const VIEW_BOX = `${box.x} ${box.y} ${box.w} ${box.h}`;

/** The mark's shapes, indented to sit inside whichever element wraps them. */
function markBody(indent) {
  const pad = ' '.repeat(indent);
  const rayPath = blades
    .map(
      ({ near, far, tip }) =>
        `M${round(near[0])} ${round(near[1])}L${round(far[0])} ${round(far[1])}L${round(tip[0])} ${round(tip[1])}Z`,
    )
    .join('');
  return [
    `${pad}<path d="${rayPath}" fill="${GOLD}" />`,
    `${pad}<circle cx="${round(sunX)}" cy="${round(sunY)}" r="${round(DISC_R)}" fill="${GOLD}" />`,
    `${pad}<path d="${land.path}" fill="${NAVY}" stroke="#ffffff" stroke-width="${KEYLINE}" stroke-linejoin="round" />`,
  ].join('\n');
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEW_BOX}" width="${box.w}" height="${box.h}" role="img" aria-label="BetterLabo">
${markBody(2)}
</svg>
`;
writeFileSync(join(webRoot, 'app', 'icon.svg'), icon, 'utf8');

const component = `/**
 * The BetterLabo emblem: the Municipality of Labo in national blue, with the
 * Philippine sun rising behind it.
 *
 * GENERATED FILE. Do not hand-edit: run \`node apps/web/scripts/generate-logo.mjs\`,
 * which derives the silhouette from the compiled municipal boundary
 * (public/data/labo-municipality.geojson) so the shape is the real municipality rather
 * than a traced approximation, and re-derives it whenever the boundary is refreshed.
 * It also measures the land's own upper edge to stand the sun ON it — the visible sun
 * is a half-disc, which is what makes it read as rising — and fits the canvas to the
 * artwork, so there is no dead sky and no ray clipped by a fixed square.
 *
 * The canvas is not square (it is ${box.w}x${box.h}). Size it by height, never with a
 * fixed \`size-N\` box: \`h-10 w-auto\` in the masthead, \`h-9 w-auto\` in the footer.
 *
 * Inline rather than an <img>: no extra request, and it inherits sizing from whatever
 * it is dropped into. The wordmark beside it is real HTML text.
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
      viewBox="${VIEW_BOX}"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
${markBody(6)}
    </svg>
  );
}
`;
mkdirSync(join(webRoot, 'components', 'brand'), { recursive: true });
writeFileSync(join(webRoot, 'components', 'brand', 'labo-mark.tsx'), component, 'utf8');

/**
 * The same mark as a data URI: `next/og` draws the social card from satori, which
 * cannot import a React component but can paint an <img> with an SVG data URI.
 */
const uriModule = `/**
 * The BetterLabo emblem as an SVG data URI, for the generated social card.
 *
 * GENERATED FILE. Do not hand-edit: run \`node apps/web/scripts/generate-logo.mjs\` so
 * this stays identical to \`labo-mark.tsx\` and the favicon.
 */
export const LABO_MARK_URI =
  'data:image/svg+xml;base64,${Buffer.from(icon, 'utf8').toString('base64')}';

/** Intrinsic size of the mark, so the card can keep its aspect when it scales it. */
export const LABO_MARK_SIZE = { width: ${box.w}, height: ${box.h} } as const;
`;
writeFileSync(join(webRoot, 'components', 'brand', 'labo-mark-uri.ts'), uriModule, 'utf8');

mkdirSync(cacheDir, { recursive: true });
const at = (px) => icon.replace(/width="[\d.]+" height="[\d.]+"/, `width="${px}"`);
writeFileSync(
  join(cacheDir, 'logo-preview.html'),
  `<!doctype html><meta charset="utf-8"><title>BetterLabo emblem</title>
<style>
 body{margin:0;background:#eef1f6;font:13px system-ui;padding:26px;display:flex;gap:26px;align-items:flex-end;flex-wrap:wrap}
 figure{margin:0;text-align:center}
 figcaption{margin-top:8px;color:#444;font-size:12px}
 .hdr{display:flex;align-items:center;gap:10px;background:#fff;padding:12px 18px;border-radius:10px;box-shadow:0 1px 3px #0002}
 .name{font-weight:700;font-size:17px;color:#111;line-height:1}
 .sub{font-size:11px;color:#666;margin-top:2px}
</style>
<figure>${at(320)}<figcaption>320px</figcaption></figure>
<figure>${at(120)}<figcaption>120px</figcaption></figure>
<figure>${at(64)}<figcaption>64px</figcaption></figure>
<figure>${at(40)}<figcaption>40px (masthead height)</figcaption></figure>
<figure>${at(24)}<figcaption>24px</figcaption></figure>
<figure><div class="hdr">${at(40)}<span><span class="name">BetterLabo</span><br><span class="sub">Labo, Camarines Norte</span></span></div><figcaption>in the masthead</figcaption></figure>
`,
  'utf8',
);

console.log(
  `land: ${rings.reduce((n, r) => n + r.length, 0)} points, ${LAND_W} x ${round(land.height)} (aspect ${round(LAND_W / land.height)})`,
);
console.log(
  `sun: centre ${round(sunX)},${round(sunY)} r=${round(DISC_R)} (${round(DISC_R / LAND_W)} of land width), rays to ${round(RAY_OUTER_CARDINAL)}/${round(RAY_OUTER_DIAGONAL)}`,
);
console.log(`canvas: ${VIEW_BOX} (aspect ${round(box.w / box.h)})`);
console.log('wrote apps/web/app/icon.svg');
console.log('wrote apps/web/components/brand/labo-mark.tsx');
console.log('wrote apps/web/components/brand/labo-mark-uri.ts');
console.log('wrote tools/etl/.cache/logo-preview.html');
