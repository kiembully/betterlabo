/**
 * Display formatters. Pure, dependency-free and identical on the server and in
 * the browser, so a figure rendered during SSR matches the client render.
 *
 * Null-safety is the point of this module: `null` means "the source did not
 * report this", and every formatter renders it as an em dash rather than as
 * zero. A budget table that shows ₱0.00 where the data is missing is the one
 * error that sends someone to the municipal hall with a wrong number.
 */

const EM_DASH = '\u2014';

export function formatPeso(value: number | null | undefined, opts?: { compact?: boolean }): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  if (opts?.compact) return `\u20B1${formatCompact(value)}`;
  return `\u20B1${value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** 12_345_678 -> "12.35M". Used for axis labels and stat tiles. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${abs.toFixed(abs < 10 ? 2 : 0)}`;
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  return value.toLocaleString('en-PH', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  return `${value.toFixed(digits)}%`;
}

export function formatArea(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  const digits = value < 1 ? 3 : 2;
  return `${formatNumber(value, digits)} km\u00B2`;
}

export function formatBytes(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return EM_DASH;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = Math.abs(value);
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${value < 0 ? '-' : ''}${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const DATE_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'Asia/Manila',
});

const DATETIME_FMT = new Intl.DateTimeFormat('en-PH', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Manila',
  timeZoneName: 'short',
});

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return DATE_FMT.format(d);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return EM_DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return EM_DASH;
  return DATETIME_FMT.format(d);
}

/** "3 days ago" — relative to an explicit `now` so SSR and CSR agree. */
export function formatRelative(iso: string | null | undefined, now: number): string {
  if (!iso) return EM_DASH;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return EM_DASH;
  const diff = Math.round((t - now) / 1000);
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  const rtf = new Intl.RelativeTimeFormat('en-PH', { numeric: 'auto' });
  for (const [unit, secs] of units) {
    if (abs >= secs) return rtf.format(Math.round(diff / secs), unit);
  }
  return rtf.format(diff, 'second');
}

/** Stable slug for anchor links and file names. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return `${input.slice(0, Math.max(0, max - 1)).trimEnd()}\u2026`;
}

/** "Anahaw (Pob.)" -> "Anahaw" for dense lists, keeping the raw name available. */
export function stripPoblacionSuffix(name: string): string {
  return name.replace(/\s*\(Pob\.?\)\s*$/i, '').trim();
}

export function pluralize(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}
