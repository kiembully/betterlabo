/**
 * Minimal xlsx reading for the BLGF sheets.
 *
 * The BLGF workbooks all share one shape: a few title rows, then a 2–3 row
 * merged header band, then one row per LGU. Rather than hard-coding column
 * numbers (which shift between fiscal years), this module expands the merged
 * header band into a full label path for every column and locates the LGU row by
 * matching the `REGION`/`PROVINCE`/`LGU NAME` columns by their header text.
 */
import ExcelJS from 'exceljs';

export async function readWorkbook(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb;
}

/** The label for a cell, expanding merged ranges and rich text. */
function cellText(ws, row, col) {
  const cell = ws.getCell(row, col);
  let v = cell.value;
  if (v == null && cell.isMerged) v = cell.master.value;
  if (v && typeof v === 'object') {
    if ('richText' in v) v = v.richText.map((t) => t.text).join('');
    else if ('result' in v) v = v.result;
    else if ('text' in v) v = v.text;
  }
  return v == null ? '' : String(v).replace(/\s+/g, ' ').trim();
}

/** Numeric value or `null` — never coerced to 0, because 0 is a real figure. */
export function cellNumber(ws, row, col) {
  const cell = ws.getCell(row, col);
  let v = cell.value;
  if (v != null && typeof v === 'object' && 'result' in v) v = v.result;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/[,₱\s]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Find the header band by the VERTICAL MERGE of the "LGU NAME" cell.
 *
 * Walking down while the identifier columns repeat is not enough: SRE merges
 * `D7:D11` and ARI merges `D7:D10`, and in both the lower rows carry real leaf
 * labels (SRE r11 = "General Fund / Special Education Fund / Total", ARI r10 =
 * the formula hints a…e). Stopping early silently mislabels every column — ARI's
 * Annual Regular Income column reads as "a" instead of its name. The merge
 * extent IS the band, so read it.
 */
export function findHeaderBand(
  ws,
  { identifiers = ['LGU NAME', 'LGU Name'], maxScan = 20 } = {},
) {
  const wanted = identifiers.map((i) => i.toLowerCase());
  for (let r = 1; r <= Math.min(maxScan, ws.rowCount); r += 1) {
    for (let c = 1; c <= Math.min(ws.columnCount, 12); c += 1) {
      if (!wanted.includes(cellText(ws, r, c).toLowerCase())) continue;
      const bounds = mergeBounds(ws, r, c);
      if (bounds) return bounds;
      // Unmerged identifier cell: a one-row band (SEF "Income" has no sub-labels).
      return { first: r, last: r };
    }
  }
  throw new Error(`No header band found in sheet "${ws.name}"`);
}

function colToNumber(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRef(ref) {
  const m = ref.match(/^([A-Z]+)(\d+)$/);
  return m ? { c: colToNumber(m[1]), r: Number(m[2]) } : null;
}

/** The `{ first, last }` row bounds of the merged range containing (row, col). */
function mergeBounds(ws, row, col) {
  for (const ref of ws.model.merges ?? []) {
    const [a, b] = ref.split(':');
    const A = parseRef(a);
    const B = parseRef(b ?? a);
    if (!A || !B) continue;
    if (row >= A.r && row <= B.r && col >= A.c && col <= B.c) return { first: A.r, last: B.r };
  }
  return null;
}

/** Build `columnPath[colIndex] = ['outermost', … , 'leaf']` for a header band. */
export function headerPaths(ws, band, columns = ws.columnCount) {
  const paths = new Map();
  for (let c = 1; c <= columns; c += 1) {
    const parts = [];
    for (let r = band.first; r <= band.last; r += 1) {
      const t = cellText(ws, r, c);
      if (t && t !== parts.at(-1)) parts.push(t);
    }
    paths.set(c, parts);
  }
  return paths;
}

/**
 * Locate the Labo row. `regionHint`/`provinceHint` disambiguate the several
 * LGUs that share a name across provinces.
 */
export function findLguRow(
  ws,
  band,
  { lgu = 'Labo', province = 'Camarines Norte', region = 'Region V' } = {},
) {
  const nameCol = findColumn(ws, band, (t) => /^lgu name$/i.test(t));
  const provCol = findColumn(ws, band, (t) => /^province$/i.test(t));
  const regCol = findColumn(ws, band, (t) => /^region$/i.test(t));
  if (nameCol == null) throw new Error(`No "LGU NAME" column in sheet "${ws.name}"`);

  for (let r = band.last + 1; r <= ws.rowCount; r += 1) {
    if (cellText(ws, r, nameCol).toLowerCase() !== lgu.toLowerCase()) continue;
    if (provCol != null) {
      const p = cellText(ws, r, provCol);
      if (p && !p.toLowerCase().includes(province.toLowerCase())) continue;
    }
    if (regCol != null) {
      const g = cellText(ws, r, regCol);
      if (g && !g.toLowerCase().includes(region.toLowerCase())) continue;
    }
    return r;
  }
  throw new Error(`No row for ${lgu}, ${province} in sheet "${ws.name}"`);
}

/** First column whose header path's last part matches `test`. */
export function findColumn(ws, band, test) {
  const paths = headerPaths(ws, band);
  for (const [col, parts] of paths) {
    const leaf = parts.at(-1) ?? '';
    if (test(leaf)) return col;
  }
  return null;
}

/** Every `{ col, path, label, group }` entry for a header band, in column order. */
export function headerColumns(ws, band) {
  const paths = headerPaths(ws, band);
  const out = [];
  for (const [col, parts] of paths) {
    if (parts.length === 0) continue;
    out.push({
      col,
      path: parts,
      leaf: parts.at(-1),
      /**
       * The grouping level is the part immediately above the leaf, NOT the
       * outermost one. In the SRE sheet the outermost part is the table title
       * ("CURRENT OPERATING INCOME", spanning 17 columns) while the useful
       * grouping is one level down ("LOCAL SOURCES", "TAX REVENUE", …).
       */
      group: parts.length > 1 ? parts.at(-2) : null,
      outer: parts[0],
    });
  }
  return out;
}
