/**
 * The barangay popup, built as a DOM node rather than a portal: MapLibre owns
 * the popup's lifecycle and removes its container on pan/close, so handing it a
 * detached element it can own outright is simpler and leak-free.
 *
 * All text goes in through `textContent` — the PSA barangay names are data, not
 * markup, and a name containing `<` must never be parsed as HTML.
 */
import { formatArea, formatNumber } from '@betterlabo/shared';

import { barangayHref } from './map-config';
import type { MapBarangay } from './types';

function row(label: string, value: string, numeric = false): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'flex items-baseline justify-between gap-3 py-1';
  const term = document.createElement('span');
  term.className = 'text-[0.6875rem] font-semibold tracking-wide text-ink-subtle uppercase';
  term.textContent = label;
  const detail = document.createElement('span');
  detail.className = numeric
    ? 'figure-num text-sm font-semibold text-ink'
    : 'text-sm text-ink';
  detail.textContent = value;
  wrapper.append(term, detail);
  return wrapper;
}

/**
 * Maps a barangay record onto the popup MapLibre shows above its polygon.
 */
export function buildBarangayPopup(barangay: MapBarangay): HTMLElement {
  const root = document.createElement('div');
  root.className = 'min-w-[11rem] max-w-[16rem]';

  const header = document.createElement('div');
  header.className = 'flex items-start justify-between gap-2';

  const title = document.createElement('p');
  title.className = 'text-sm font-bold text-ink';
  title.textContent = barangay.displayName || barangay.name;
  header.append(title);

  if (barangay.isPoblacion) {
    const chip = document.createElement('span');
    chip.className = 'chip border-brand-300 bg-brand-50 text-brand-900';
    chip.textContent = 'Poblacion';
    header.append(chip);
  }
  root.append(header);

  const code = document.createElement('p');
  code.className = 'figure-num mt-0.5 text-[0.6875rem] text-ink-subtle';
  code.textContent = `PSGC ${barangay.psgcCode}`;
  root.append(code);

  const body = document.createElement('div');
  body.className = 'mt-2 border-t border-rule pt-1';
  body.append(row('Land area', formatArea(barangay.areaSqKm), true));
  body.append(
    row(
      'Population',
      barangay.population == null ? 'Not reported' : formatNumber(barangay.population),
      true,
    ),
  );
  if (barangay.centroid) {
    body.append(
      row(
        'Centroid',
        `${barangay.centroid.lat.toFixed(5)}, ${barangay.centroid.lng.toFixed(5)}`,
        true,
      ),
    );
  }
  root.append(body);

  const link = document.createElement('a');
  link.href = barangayHref(barangay.psgcCode);
  link.className =
    'mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 underline';
  link.textContent = 'Open the barangay page';
  root.append(link);

  return root;
}
