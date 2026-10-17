/**
 * Generate the BetterLabo emblem: the Philippine sun, with the Municipality of Labo
 * at its centre.
 *
 * The silhouette is the REAL outline of the Municipality of Labo, taken from
 * `apps/web/public/data/labo-municipality.geojson` (PSA PSGC + NAMRIA, compiled by
 * the ETL). Tracing the DTI/CMCI seal would mean hand-drawing a boundary and getting
 * it subtly wrong; deriving it means the shape is the actual municipality, and it
 * regenerates whenever the boundary source is refreshed.
 *
 * WHY A SUN
 *
 * The flag's sun is the one motif every Filipino reads instantly, and the reference
 * site uses the same device. It also fixes a real problem rather than decorating one:
 * Labo is ~1.96:1 wide once longitude is corrected for latitude, so inside a plain
 * circle the silhouette collapses into a thin band floating in empty space. The rays
 * occupy the space above and below it, so the composition is full instead of a stripe
 * in a void.
 *
 * Rays follow the flag's construction: eight directions, each split into two tapering
 * blades, with the cardinal (N/E/S/W) rays reaching further than the diagonals.
 *
 * Palette is the national blue and gold, matching the civic-site family the reference
 * belongs to; no artwork or letterforms are copied from anyone.
 *
 * Writes:
 *   apps/web/components/brand/labo-mark.tsx   inline SVG, no extra network request
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

const SIZE = 64;
const CX = SIZE / 2;
const CY = SIZE / 2;
const DISC_R = 12.8;
const RAY_INNER = 14.0;
const RAY_OUTER_CARDINAL = 25.2;
const RAY_OUTER_DIAGONAL = 22.0;
/**
 * Half-width of a blade, in degrees, measured at the disc edge. Blades taper outward.
 *
 * These two numbers carry the whole look. The first attempt used a 1.6 degree gap and
 * 5.2 degree blades, and the two blades of each ray fused into a single spike — the
 * mark read as twelve lone rays rather than the flag's eight split rays. The gap has to
 * be wide enough to survive at 36px, which is the size the masthead actually uses.
 */
const BLADE_SPREAD = 6.0;
/** Gap between the two blades of one ray, in degrees. */
const BLADE_GAP = 3.6;

const round = (n) => Math.round(n * 100) / 100;

function polar(radius, degrees) {
  const radians = ((degrees - 90) * Math.PI) / 180;
  return `${round(CX + radius * Math.cos(radians))} ${round(CY + radius * Math.sin(radians))}`;
}

/** The flag's sun: eight rays, each two tapering blades, cardinals reaching further. */
function sunPath() {
  const blades = [];
  for (let index = 0; index < 8; index += 1) {
    const bearing = index * 45;
    const outer = bearing % 90 === 0 ? RAY_OUTER_CARDINAL : RAY_OUTER_DIAGONAL;
    for (const side of [1, -1]) {
      const near = bearing + side * BLADE_GAP;
      const far = near + side * BLADE_SPREAD;
      const tip = polar(outer, bearing + side * (BLADE_GAP + BLADE_SPREAD / 2));
      blades.push(`M${polar(RAY_INNER, near)}L${polar(RAY_INNER, far)}L${tip}Z`);
    }
  }
  return blades.join('');
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
 * Project lng/lat into a box.
 *
 * Longitude is scaled by cos(centre latitude) — without it the municipality is
 * stretched ~3% at 14 degrees north, small enough to look like a mistake and large
 * enough to be one.
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
const rays = sunPath();
// Sized inside the disc with a margin, so the silhouette never touches the rim and the
// disc edge still reads as a circle at 16px.
const silhouetteBox = DISC_R * 2 - 4;
const silhouette = project(rings, silhouetteBox, silhouetteBox, 0);
const silhouetteOffset = `translate(${round(CX - silhouetteBox / 2)} ${round(CY - silhouetteBox / 2)})`;

/** The mark's shapes, indented to sit inside whichever element wraps them. */
function markBody(indent) {
  const pad = ' '.repeat(indent);
  return [
    `${pad}<circle cx="${CX}" cy="${CY}" r="${DISC_R}" fill="${GOLD}" />`,
    `${pad}<path d="${rays}" fill="${GOLD}" />`,
    `${pad}<g transform="${silhouetteOffset}">`,
    `${pad}  <path d="${silhouette}" fill="${NAVY}" />`,
    `${pad}</g>`,
  ].join('\n');
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="BetterLabo">
${markBody(2)}
</svg>
`;
writeFileSync(join(webRoot, 'app', 'icon.svg'), icon, 'utf8');

const component = `/**
 * The BetterLabo emblem: the Philippine sun, with the Municipality of Labo at its centre.
 *
 * GENERATED FILE. Do not hand-edit: run \`node apps/web/scripts/generate-logo.mjs\`,
 * which derives the silhouette from the compiled municipal boundary
 * (public/data/labo-municipality.geojson) so the shape is the real municipality rather
 * than a traced approximation, and re-derives it whenever the boundary is refreshed.
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
      viewBox="0 0 ${SIZE} ${SIZE}"
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

mkdirSync(cacheDir, { recursive: true });
const at = (px) => icon.replace(/width="\d+" height="\d+"/, `width="${px}"`);
writeFileSync(
  join(cacheDir, 'logo-preview.html'),
  `<!doctype html><meta charset="utf-8"><title>BetterLabo emblem</title>
<style>
 body{margin:0;background:#eef1f6;font:13px system-ui;padding:26px;display:flex;gap:28px;align-items:flex-end}
 figure{margin:0;text-align:center}
 figcaption{margin-top:8px;color:#444;font-size:12px}
 .hdr{display:flex;align-items:center;gap:10px;background:#fff;padding:12px 18px;border-radius:10px;box-shadow:0 1px 3px #0002}
 .name{font-weight:700;font-size:17px;color:#111;line-height:1}
 .sub{font-size:11px;color:#666;margin-top:2px}
</style>
<figure>${at(240)}<figcaption>240px</figcaption></figure>
<figure>${at(120)}<figcaption>120px</figcaption></figure>
<figure>${at(64)}<figcaption>64px</figcaption></figure>
<figure>${at(36)}<figcaption>36px (masthead)</figcaption></figure>
<figure>${at(16)}<figcaption>16px (favicon)</figcaption></figure>
<figure><div class="hdr">${at(36)}<span><span class="name">BetterLabo</span><br><span class="sub">Labo, Camarines Norte</span></span></div><figcaption>in the masthead</figcaption></figure>
`,
  'utf8',
);

console.log(`rings: ${rings.length}, points: ${rings.reduce((n, r) => n + r.length, 0)}`);
console.log(
  `sun: disc r=${DISC_R}, 8 rays x 2 blades, cardinals to ${RAY_OUTER_CARDINAL}, diagonals to ${RAY_OUTER_DIAGONAL}`,
);
console.log('wrote apps/web/app/icon.svg');
console.log('wrote apps/web/components/brand/labo-mark.tsx');
console.log('wrote tools/etl/.cache/logo-preview.html');
