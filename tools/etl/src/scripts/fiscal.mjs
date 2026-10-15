/**
 * TASK fiscal — compile Labo's FY 2024 local fiscal figures from four BLGF
 * per-LGU workbooks into `public/data/fiscal.json`.
 *
 * The workbooks share one shape: title rows, a 2–5 row merged header band, then
 * one row per LGU. Column positions move between fiscal years and the band's
 * depth differs per sheet (SRE merges 5 rows deep, ARI 4, LDRRMF 2), so nothing
 * is hard-coded: the band is read from the merge extent of the "LGU NAME" cell,
 * expanded into a label path per column, and the Labo row is located by matching
 * the REGION / PROVINCE / LGU NAME columns.
 *
 * Two normalisations the source needs:
 *  - A group spanning the whole band is a table title, not a grouping, and is
 *    dropped from the labels (otherwise every SEF expenditure reads
 *    "Expenditures on Education, Culture & Sports… — General Administration").
 *  - The dependency columns store FRACTIONS (0.1143), not percentages, and the
 *    SRE caption claims "In Php Million" while its values are pesos.
 *
 * UNIT NOTE: Labo's National Tax Allotment reads 446,931,453.96 — ₱446.93 M,
 * plausible for a first-class municipality, and ₱446.93 trillion if the caption
 * were honest. The compiled file records `unit: "PHP"` plus a note naming the
 * discrepancy rather than rescaling on a hunch.
 */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

import { downloadToFile, log, sha256File } from '../lib/http.mjs';
import { paths } from '../lib/paths.mjs';
import { recordProvenance } from '../lib/registry.mjs';
import { SOURCES } from '../lib/sources.mjs';
import { writeStableJson } from '../lib/write.mjs';
import {
  cellNumber,
  findHeaderBand,
  findLguRow,
  headerColumns,
  readWorkbook,
} from '../lib/xlsx.mjs';

const LGU = { lgu: 'Labo', province: 'Camarines Norte', region: 'Region V' };
const IDENTIFIER_COLUMNS = /^(region|province|lgu name|lgu type)$/i;
/** A group covering more than this many columns is a table title, not a grouping. */
const TITLE_GROUP_SPAN = 8;

const round2 = (n) => (n == null ? null : Math.round(n * 100) / 100);
const round4 = (n) => (n == null ? null : Math.round(n * 10000) / 10000);
const normalise = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function slug(input) {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** BLGF shouts its headings; make them readable without changing the words. */
function titleCase(input) {
  const s = String(input).replace(/\s+/g, ' ').trim();
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bNta\b/g, 'NTA')
    .replace(/\bLsr\b/g, 'LSR')
    .replace(/\bSef\b/g, 'SEF')
    .replace(/\bEvat\b/g, 'EVAT')
    .replace(/\bAri\b/g, 'ARI')
    .replace(/\bRa\b/g, 'RA')
    .replace(/\bPcsO\b|\bPcso\b/gi, 'PCSO')
    .replace(/\bPagcor\b/gi, 'PAGCOR');
}

/** The source's own formula hint ("e = sum(a,b,c,d)", "g = c / e"). */
function isFormulaHint(leaf) {
  return /^[a-z]$/i.test(leaf.trim()) || /[=]/.test(leaf) || /\bsum\(/i.test(leaf);
}

function labelFor(column, groupName) {
  const leaf = column.leaf ?? '';
  if (isFormulaHint(leaf) && groupName) return titleCase(groupName);
  if (groupName && normalise(leaf) === normalise(groupName)) return titleCase(groupName);
  return titleCase(leaf);
}

/**
 * Section titles. One or two grouped columns have no honest group name from the
 * source (a flat "Total" column, or the SRE sheet's trailing fund-balance block),
 * so they are named here rather than shipped as "By LGU SRE FY2024".
 */
function sheetTitle(key, resolvedGroup, wsName) {
  if (resolvedGroup) {
    if (/^total$/i.test(resolvedGroup.trim())) return `${key.toUpperCase()} — Total`;
    return titleCase(resolvedGroup);
  }
  if (key === 'sre' && /^by lgu sre/i.test(wsName.trim())) {
    return 'Fund balance and non-operating items';
  }
  return titleCase(wsName);
}

async function compileWorkbook(key, { force, offline }) {
  const meta = SOURCES.fiscal.sheets[key];
  const dest = join(paths.cacheDir, `blgf-${key}-fy2024.xlsx`);
  if (!offline) await downloadToFile(meta.url, dest, { force });
  const wb = await readWorkbook(dest);
  const sheets = [];
  /** Per-section bookkeeping for the sub-section linking pass below. */
  const pending = [];

  for (const ws of wb.worksheets) {
    if (ws.rowCount < 20) continue; // Metadata tabs
    let band;
    try {
      band = findHeaderBand(ws);
    } catch {
      continue;
    }
    let rowIdx;
    try {
      rowIdx = findLguRow(ws, band, LGU);
    } catch {
      continue;
    }

    const columns = headerColumns(ws, band).filter(
      (c) => c.leaf && !IDENTIFIER_COLUMNS.test(c.leaf),
    );

    const spanCount = new Map();
    for (const c of columns) {
      if (!c.group) continue;
      spanCount.set(c.group, (spanCount.get(c.group) ?? 0) + 1);
    }
    const titleGroups = new Set(
      [...spanCount.entries()].filter(([, n]) => n > TITLE_GROUP_SPAN).map(([g]) => g),
    );

    const buckets = new Map();
    for (const c of columns) {
      const group = c.group && !titleGroups.has(c.group) ? c.group : null;
      const bucket = group ?? '__root__';
      if (!buckets.has(bucket)) buckets.set(bucket, []);
      buckets.get(bucket).push(c);
    }

    for (const [groupName, cols] of buckets) {
      const resolvedGroup = groupName === '__root__' ? null : groupName;
      const isRatio = /DEPENDENCY|RATIO|SHARE OF/i.test(resolvedGroup ?? '');
      const figures = [];

      for (const c of cols) {
        const raw = cellNumber(ws, rowIdx, c.col);
        const isTotal = /^total/i.test(c.leaf);
        if (raw == null && !isTotal) continue;
        figures.push({
          label: labelFor(c, resolvedGroup),
          amount: raw,
          sharePercent: null,
          note: isFormulaHint(c.leaf) ? `Source definition: ${c.leaf.trim()}` : null,
        });
      }
      if (figures.length === 0) continue;

      const totalFigure = figures.find((f) => /^total/i.test(f.label));
      const parts = figures.filter((f) => !/^total/i.test(f.label));
      const sumOfParts = parts.reduce((s, f) => (f.amount == null ? s : s + f.amount), 0);

      if (isRatio) {
        // The source stores these as fractions; the portal reports percentages.
        for (const f of figures) f.amount = round4((f.amount ?? 0) * 100);
      }
      const total = isRatio
        ? round4((totalFigure?.amount ?? sumOfParts) * 100)
        : (totalFigure?.amount ??
          (resolvedGroup || figures.length === 1 ? round2(sumOfParts) : null));

      if (!isRatio && sumOfParts > 0) {
        for (const f of figures) {
          if (/^total/i.test(f.label) || f.amount == null) continue;
          f.sharePercent = round2((f.amount / sumOfParts) * 100);
        }
      }
      for (const f of figures) f.amount = round2(f.amount);

      /**
       * Flag a total that disagrees with its own listed components instead of
       * quietly shipping either number. Two causes are distinguished later: a
       * section whose Total legitimately includes a sub-section compiled as its
       * own sheet (SRE "Tax Revenue" excludes the separate "Real Property Tax"
       * sheet), and a genuine source inconsistency.
       */
      const gap =
        !isRatio && totalFigure?.amount != null && sumOfParts > 0
          ? totalFigure.amount - sumOfParts
          : null;

      const title = sheetTitle(key, resolvedGroup, ws.name);
      const sheet = {
        id: `${key}-${slug(resolvedGroup ?? ws.name)}`,
        title,
        fiscalYear: 2024,
        unit: isRatio ? '%' : 'PHP',
        basis: `BLGF — ${meta.title}, sheet "${ws.name}", row ${rowIdx}, columns ${cols[0].col}–${cols.at(-1).col}`,
        total,
        figures,
        sourceId: SOURCES.fiscal.id,
        note: null,
      };
      sheets.push(sheet);
      pending.push({
        sheet,
        groupName: resolvedGroup,
        parentName: cols[0]?.path?.at(-3) ?? null,
        sumOfParts,
        totalAmount: totalFigure?.amount ?? null,
        gap,
      });
    }
  }

  /* ── link sections whose Total includes another compiled section ── */
  const byGroupName = new Map();
  for (const p of pending) {
    if (p.groupName) byGroupName.set(normalise(p.groupName), p);
  }
  for (const p of pending) {
    if (p.gap == null || p.gap === 0) continue;
    const subs = pending.filter(
      (other) =>
        other !== p &&
        other.groupName &&
        other.parentName &&
        normalise(other.parentName) === normalise(p.groupName) &&
        Math.abs((other.sheet.total ?? 0) - p.gap) <= Math.max(1, Math.abs(p.gap) * 0.01),
    );
    if (subs.length > 0) {
      p.sheet.subSections = subs.map((s) => s.sheet.id);
      p.sheet.note = `This section's Total includes ${subs
        .map((s) => `“${s.sheet.title}”`)
        .join(', ')}, compiled as ${subs.length === 1 ? 'its own section' : 'its own sections'} because the source header nests it one level deeper. The listed components therefore do not sum to the Total on their own.`;
      continue;
    }
    const parent = p.parentName ? byGroupName.get(normalise(p.parentName)) : null;
    if (p.gap !== 0) {
      p.sheet.note = parent
        ? `The source's Total row (${p.totalAmount.toLocaleString('en-PH')}) does not equal the sum of the components listed here (${p.sumOfParts.toLocaleString('en-PH')}); the difference belongs to a nested header level the source groups separately. Both figures are reproduced exactly as published.`
        : `The source's Total row (${p.totalAmount.toLocaleString('en-PH')}) does not equal the sum of its listed components (${p.sumOfParts.toLocaleString('en-PH')}). Both are reproduced exactly as published; treat the component breakdown as indicative.`;
    }
  }

  return { meta, dest, sheets };
}

export async function run(ctx) {
  const src = SOURCES.fiscal;
  const compiled = [];
  for (const key of Object.keys(src.sheets)) {
    const result = await compileWorkbook(key, ctx);
    compiled.push({ key, ...result });
    log(
      `fiscal/${key}: ${result.sheets.length} sheet(s), ${result.sheets.reduce((n, s) => n + s.figures.length, 0)} figures`,
    );
  }

  const SRE_UNIT_NOTE =
    'The source workbook is captioned "In Php Million"; its values are pesos (Labo’s National Tax Allotment reads ₱446,931,453.96 — ₱446.93 M, not ₱446.93 T). Values are reproduced exactly as published.';

  const emitted = compiled.flatMap((c) =>
    c.sheets.map((sheet) => ({
      ...sheet,
      note: [c.key === 'sre' ? SRE_UNIT_NOTE : null, sheet.note].filter(Boolean).join(' ') || null,
    })),
  );

  // Guard against two worksheets in one workbook collapsing to the same id.
  const seen = new Map();
  for (const sheet of emitted) {
    const n = (seen.get(sheet.id) ?? 0) + 1;
    seen.set(sheet.id, n);
    if (n > 1) sheet.id = `${sheet.id}-${n}`;
  }

  const figureCount = emitted.reduce((n, s) => n + s.figures.length, 0);
  const sheetsWithData = emitted.filter((s) =>
    s.figures.some((f) => f.amount != null && f.amount !== 0),
  );

  await writeStableJson(paths.fiscal, {
    municipality: 'Labo',
    municipalityPsgcCode: '0501606000',
    fiscalYear: 2024,
    preliminary: true,
    sheets: emitted,
    note:
      'FY 2024 figures as published by BLGF, marked "Preliminary" by the source. Nominal pesos, not inflation-adjusted. Rows the source leaves blank are published as null, never as zero.',
    sources: [src.id],
  });

  const sizes = await Promise.all(compiled.map(async (c) => (await stat(c.dest)).size));

  await recordProvenance({
    id: src.id,
    title: src.title,
    publisher: src.publisher,
    portalDatasetId: src.portalDatasetId,
    portalUrl: src.portalUrl,
    sourceUrl: src.sheets.sre.url,
    license: src.license,
    licenseUrl: src.licenseUrl,
    attributionText: src.attributionText,
    retrievedAt: new Date().toISOString(),
    sourceVersion: src.sourceVersion,
    rowCount: figureCount,
    bytes: sizes.reduce((a, b) => a + b, 0),
    sha256: await sha256File(compiled.find((c) => c.key === 'sre')?.dest ?? compiled[0].dest),
    outputs: [
      'apps/web/public/data/fiscal.json',
      ...compiled.map((c) => `BLGF — ${c.meta.title} (resource ${c.meta.resourceId})`),
    ],
    notes:
      'Four per-LGU workbooks, one row selected for Labo, Camarines Norte. sha256 is of the Statement of Receipts and Expenditures workbook; bytes is the combined download size.',
    unavailable: false,
  });

  log(`fiscal: ${emitted.length} sheets (${sheetsWithData.length} with non-zero data), ${figureCount} figures`);
}
