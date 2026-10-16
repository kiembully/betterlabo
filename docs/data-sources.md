# Data sources, URLs, and the transformation applied to each

Every URL below was resolved by reading the BetterGov.ph Open Data Portal's own
JSON API (`/api/v1/datasets/<id>` and `/api/v1/resources?dataset_id=<id>`) or the
upstream release's asset list. Nothing here is reconstructed from memory, and
`npm run etl` records the retrieval in `apps/web/public/data/datasets.json`.

---

## 1. Philippine Barangay Boundaries (Hierarchical GeoJSON)

| | |
| --- | --- |
| Portal | https://data.bettergov.ph/datasets/23 |
| Publisher | Manuel Balmeo — PSA PSGC snapshots (2023-10-24) + NAMRIA administrative boundaries (v2023-11-06) |
| Licence | MIT — https://github.com/bendlikeabamboo/barangay-boundaries-repository/blob/main/LICENSE |
| Release | `v2026.4.13.0` |
| Files | `barangays.geojson` (66.9 MB, 42,026 features) · `municipalities.geojson` (6.0 MB, 1,485 features) |
| URL pattern | `https://github.com/bendlikeabamboo/barangay-boundaries-repository/releases/download/v2026.4.13.0/<file>` |

**Transformation.** Labo is `ADM3_PCODE = PH0501606` / `psgc_code = 0501606000`.
Filtering the national barangay file on that prefix returns **exactly 52**
features, which `etl:verify` asserts on every run. Geometry is simplified at
0.0002° (~22 m) and written minified to `labo-barangays.geojson` (25 KB).
Per-barangay `areaSqKm` is the upstream `AREA_SQKM` value (NAMRIA-derived), **not
recomputed** from the simplified polygon — the sum of the 52 barangay areas is
checked against the municipal polygon's own area within 2%.

---

## 2. BLGF Local Government Unit Fiscal Data

| | |
| --- | --- |
| Portal | https://data.bettergov.ph/datasets/9 |
| Publisher | Bureau of Local Government Finance (BLGF), Department of Finance |
| Licence | Public Domain |
| Source version | FY 2024 (Preliminary) |

Four workbooks are used, each a per-LGU table containing one row for Labo in
Camarines Norte:

| Resource | Title | URL |
| --- | --- | --- |
| 30 | FY 2024 Statement of Receipts and Expenditures by LGU | `blgf.gov.ph/wp-content/uploads/2025/08/By-LGU-SRE-2024.xlsx` |
| 31 | FY 2024 Annual Regular Income and Dependencies by LGU | `blgf.gov.ph/wp-content/uploads/2025/06/By-LGU-ARI-and-Dependencies-2024.xlsx` |
| 44 | FY 2024 Special Education Fund Income and Expenditures | `blgf.gov.ph/wp-content/uploads/2025/06/FY2024-SEF-Income-and-Expenditures.xlsx` |
| 41 | FY 2024 Local Disaster Risk Reduction Management Fund by LGU | `blgf.gov.ph/wp-content/uploads/2025/06/FY2024-LDRRMF-by-LGU.xlsx` |

**Transformation.** Nothing is hard-coded: the header band is read from the
vertical merge extent of the `LGU NAME` cell (SRE merges 5 rows, ARI 4, LDRRMF
2), expanded into a label path per column, and the Labo row is located by
matching the REGION / PROVINCE / LGU NAME columns. 31 sections and 95 figures are
compiled.

Four source quirks are handled explicitly, and each is stated in the output
rather than smoothed over:

1. **The SRE workbook is captioned "In Php Million" and its values are pesos.**
   Labo's National Tax Allotment reads `446,931,453.96` — ₱446.93 M, which is
   plausible for a first-class municipality, and ₱446.93 T if the caption were
   true. Values are reproduced as published and the discrepancy is carried in the
   section's `note`.
2. **Dependency columns store fractions** (`0.1143`), not percentages. They are
   multiplied by 100 and the section is marked `unit: "%"`.
3. **A section total can include a sub-section compiled separately.** SRE
   "Tax Revenue" (₱34,626,442.07) does not equal the sum of the rows listed under
   it because "Real Property Tax" is nested one header level deeper. The ETL links
   the two (`subSections`) instead of reporting a phantom discrepancy.
4. **One total genuinely does not foot.** Non-operating expenditures total
   ₱179,595,101.96 against ₱0 of listed components. Both figures are published and
   the mismatch is stated on the page.

**Access note.** `blgf.gov.ph` is behind a WAF that answers Node's `fetch` with
`NGHTTP2_PROTOCOL_ERROR` and answers a bare user agent with `403`. The ETL's HTTP
layer uses `node:https` with HTTP/1.1, a browser-like UA and a Referer.

---

## 3. DPWH Infrastructure Transparency Dataset

| | |
| --- | --- |
| Portal | https://data.bettergov.ph/datasets/19 |
| Publisher | Department of Public Works and Highways |
| Licence | CC0 1.0 Universal |
| File | `https://huggingface.co/datasets/bettergovph/dpwh-transparency-data/resolve/main/dpwh_transparency_data.parquet` (24 MB, 248,220 rows) |

**Transformation.** Downloaded once to the ETL cache with the shared resumable
downloader, then read from disk with `hyparquet` and a 17-of-25-column projection;
streaming over HTTP range requests is kept as the fallback when a download cannot
complete. (`compressors` must **not** be passed to `parquetReadObjects` here —
hyparquet handles the file's own compression, and an explicit map fails with
`Cannot create property '0' on number`.)

Selecting Labo's projects needed three findings, and each changed the answer:

1. **`location.province` is not a project location.** It holds the implementing
   **District Engineering Office** — real values read `"Camarines Norte DEO"`,
   `"Agusan del Norte DEO"`, `"Region V"`. Filtering it for a municipality matches
   nothing at all, and filtering it for a province only says which office built the
   thing, not where it stands.
2. **The dataset does carry `latitude`/`longitude`** — 214,747 of the 248,220 rows
   have usable coordinates, so projects can be located properly rather than
   guessed at from prose.
3. **A bounding-box test over Labo's rectangle over-includes its neighbours.** The
   bbox's western edge reaches into Tagkawayan, Quezon, and 28 rows are implemented
   by `"Quezon 4th DEO"`. The selector is therefore a **point-in-polygon test
   against the compiled barangay polygons** — the same authoritative geometry the
   hazard clip uses — and the containing barangay is recorded on each project.

**Result:** 478 rows fall inside the bounding box, **309 fall inside a Labo
barangay** (the polygon test removes 169 neighbour over-inclusions), spanning
**50 of the 52 barangays**, 2016–2025, ₱10.76 B in contract amounts. The largest
entries are flood-control structures on the **Labo River** and the **Busigon
River** — the exact vulnerability the project brief names.

**Published exclusions**, because they are real and cannot be verified: 203 rows
name Labo in their description but carry no usable coordinate, so they are counted
in `counts.mentionsLaboButUnlocated` and left out of the compiled list rather than
placed on a guess.

---

## 4. Project NOAH Hazard Maps

| | |
| --- | --- |
| Portal | https://data.bettergov.ph/datasets/22 |
| Publisher | Project NOAH (Nationwide Operational Assessment of Hazards), DOST |
| Licence | ODC-ODbL — https://opendatacommons.org/licenses/odbl/1-0/ |
| Source version | 2026-04-11 |

Per-province shapefile archives (`Flood/{5yr,25yr,100yr}`, `Landslide/
LandslideHazards`, `Storm Surge/StormSurgeAdvisory1`) and pre-tiled PMTiles
layers, all on `huggingface.co/datasets/bettergovph/project-noah-hazard-maps`.

**Transformation.** Each province archive is a zipped **shapefile** set
(`.shp/.dbf/.prj/.shx`) in WGS84 — not GeoJSON — parsed with `shpjs`, then:

1. bbox prefilter against Labo's bounds;
2. exact intersection with the municipal outline where the upstream contour
   allows it (self-intersecting contours fall back to a bbox clip, and the count
   of fallbacks is published);
3. **discard every polygon piece whose interior point falls outside the Labo
   outline**, so hazard belonging to neighbouring municipalities is not shown;
4. simplify (0.0003°, raised automatically to stay under 8 MB) and round
   coordinates to 4 decimals;
5. class field resolved per layer — the storm-surge shapefile carries `HAZ`, the
   flood shapefile carries `Var`.

**Result for the layers compiled so far:**

| Layer | Mode | Notes |
| --- | --- | --- |
| `flood_5yr` | static, 3 features, 6.4 MB | 36 of 52 barangays contain mapped flood hazard |
| `storm_surge` | **none-in-area** | compiled and analysed: zero overlap with Labo |
| `flood_25yr`, `flood_100yr`, `landslide` | absent | province archive not fetched in the last run |

A layer that compiles to zero features is reported as `none-in-area` and the map
says so in words. It is **not** reported as compiled-with-an-empty-file, which
would present a toggle that does nothing.

**Per-barangay exposure** (`barangay-exposure.json`) is derived from the static
layers: a barangay is marked exposed when a mapped hazard patch lies inside its
boundary polygon, or when the barangay centre falls inside a patch; the class
reported is the highest among the patches that matched, and the patch count is
published so the strength of the signal is visible. This is deliberately coarser
than a share-of-area calculation, and the file says so.

---

## 5. Municipality of Labo — official website (labo.gov.ph)

**What it is.** The only source that says *who* runs Labo and *where* to find
them. It carries the municipal officials and department heads with their office,
floor and telephone number, the Sangguniang Bayan roster, the five department
clusters with the offices inside each, a municipal profile (area, climate,
economy, the 52 barangays) and every procurement document published under
`/docs/`.

**Why it is read through the Wayback Machine.** The live host sits behind a
Cloudflare interactive challenge: every path answers `403` with
`Cf-Mitigated: challenge` and a "Just a moment…" body — including `/robots.txt`,
`/sitemap.xml` and `/wp-json/wp/v2/pages`, so there is no API-first pivot
available. Dated archive captures are the workable route, and a timestamped
snapshot is *better* provenance than a live scrape of a page whose content moves.

**Transformation.** `tools/etl/src/lib/wayback.mjs` walks snapshots newest-first
and accepts the first that is a `200`, large enough to hold real content, and not
an archived challenge page. That last check exists because the Archive happily
stores Cloudflare's "One moment, please… Loader" interstitial and serves it with
`200`; without screening it, the capture reads as "the page is empty" rather than
"the capture is useless". `tools/etl/src/scripts/lgu.mjs` then parses the pages
positionally, because the markup is a flat sequence rather than selectors.

**Two findings that shaped the output, and neither is cosmetic:**

1. **The current capture names nobody.** As of the 2026-02-01 capture of the
   officials page, the executive section lists only "Office of the Municipal
   Mayor" and "Office of the Municipal Vice Mayor" — no names — and the
   legislative page is an empty "MUNICIPAL COUNCILORS" heading. The department
   and section heads *are* still named. The LGU's own news index carries an item
   about the mayor and vice mayor being suspended and DILG filling two vacant
   Sangguniang Bayan seats. So the task never asserts a current office-holder it
   cannot see: names are recovered only from an older capture that still states
   them, each carries `nameAsOf` (the last date the page stated it) and
   `nameRemovedFromCurrentPage`, and `/officials` shows a standing warning rather
   than a plausible-looking incumbent.
2. **The roster is not static.** Between the 2024-04 and 2026-02 captures the
   social welfare officer changed, two section heads swapped roles, and three new
   offices appeared. Every section therefore records its own snapshot date.

**The cross-check that makes this file worth trusting.** The site's own barangay
list is compared against the PSGC-compiled index in `barangays.json`. They agree
**52 of 52**, once the `(Poblacion)`/`(Pob.)` and `(Silang)` suffixes are
normalised — two independent sources agreeing on all 52 names.

**Parsing traps worth remembering**, all of which produced wrong data before they
were handled:

- The legislative page mixes label directions: an ordinary role line comes *after*
  a name, while a `REPRESENTATIVE, LIGA NG MGA BARANGAY` label comes *before* the
  name it belongs to. Reading both the same way shifts every title by one.
- A capture whose only content is a heading yields an empty roster; the caller has
  to fall back to an older capture rather than publish nothing.
- Names arrive decomposed (`CARDIÑO` as `n` + U+0303), so a naive word-boundary
  title-caser emits `CardiÑO`. Normalise to NFC and capitalise on "preceded by
  whitespace/period/apostrophe" instead.
- Hyphens must *not* trigger capitalisation: Filipino names hyphenate with a
  lowercase element (`Sina-on`), and `Sina-On` is simply wrong.

**Result:** 29 named people (2 executive offices, 20 department heads, 7 section
heads), 11 legislative members with one vacant SK seat recorded, 30 offices
across the 5 clusters, and 1,501 published documents indexed. The document index
is ~660 KB, so it lives in its own file (`lgu-documents.json`) that only
`/documents` fetches.

**Licence:** the site's own footer states "All content is in the public domain
unless otherwise stated."

---

## Adding a source

1. Resolve the file URL against the portal API — do not guess it:
   `https://data.bettergov.ph/api/v1/resources?dataset_id=<id>&limit=100&offset=0`
2. Add it to `tools/etl/src/lib/sources.mjs` with its licence, licence URL and
   attribution text **copied from the dataset record**.
3. Write a task under `tools/etl/src/scripts/`, call `recordProvenance` with what
   it produced, and register it in `tools/etl/src/cli.mjs`.
4. Add assertions to `verify.mjs` so a silent upstream change fails the refresh.
5. Reference the new file's `id` from `profile.json`/`datasets.json` outputs so
   `/data` shows it.
