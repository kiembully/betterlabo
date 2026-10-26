/**
 * The BetterLabo emblem: the Municipality of Labo in national blue, with the
 * Philippine sun rising behind it.
 *
 * GENERATED FILE. Do not hand-edit: run `node apps/web/scripts/generate-logo.mjs`,
 * which derives the silhouette from the compiled municipal boundary
 * (public/data/labo-municipality.geojson) so the shape is the real municipality rather
 * than a traced approximation, and re-derives it whenever the boundary is refreshed.
 * It also measures the land's own upper edge to stand the sun ON it — the visible sun
 * is a half-disc, which is what makes it read as rising — and fits the canvas to the
 * artwork, so there is no dead sky and no ray clipped by a fixed square.
 *
 * The canvas is not square (it is 63.31x45.16). Size it by height, never with a
 * fixed `size-N` box: `h-10 w-auto` in the masthead, `h-9 w-auto` in the footer.
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
      viewBox="-0.8 -14.78 63.31 45.16"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M45.74 -4.06L46.54 -3.95L47.53 -13.98ZM44.74 -4.06L43.94 -3.95L42.95 -13.98ZM50.23 -1.79L50.72 -1.15L57.09 -6.47ZM49.52 -2.5L48.88 -2.98L54.2 -9.36ZM51.8 3L51.69 3.79L61.71 4.78ZM51.8 1.99L51.69 1.19L61.71 0.21ZM49.52 7.49L48.88 7.97L54.2 14.35ZM50.23 6.77L50.72 6.13L57.09 11.46ZM44.74 9.05L43.94 8.94L42.95 18.96ZM45.74 9.05L46.54 8.94L47.53 18.96ZM40.25 6.77L39.76 6.13L33.39 11.46ZM40.96 7.49L41.6 7.97L36.28 14.35ZM38.68 1.99L38.79 1.19L28.77 0.21ZM38.68 3L38.79 3.79L28.77 4.78ZM40.96 -2.5L41.6 -2.98L36.28 -9.36ZM40.25 -1.79L39.76 -1.15L33.39 -6.47Z" fill="#f2c91d" />
      <circle cx="45.24" cy="2.49" r="7.08" fill="#f2c91d" />
      <path d="M58 12.58L55.07 15.88L50.98 25.46L46.98 29.58L0 10.17L0.35 5.24L1.05 2.09L12.93 2.52L18.92 1.52L31.16 4.67L36.94 2.26L45.33 2.85L48.43 0.35L57.17 0L56.42 3.86L55.29 4.64L57.21 4.64L57.59 7.99L56.62 9.12L57.97 10.35L57.25 11.57L58 12.58Z" fill="#0032a0" stroke="#ffffff" stroke-width="1.7" stroke-linejoin="round" />
    </svg>
  );
}
