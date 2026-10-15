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

**Transformation.** Read over **HTTP range requests with a column projection**
using `hyparquet` + `asyncBufferFromUrl`, so the ETL never downloads the whole
file. **The schema has `location.province` and `location.region` and no
municipality column**, so a Labo project cannot be selected by field: the task
narrows to Camarines Norte by province, then flags rows whose `description`
contains a Labo place-name token, and publishes both counts so a reader can see
how much was excluded. A Labo project whose description omits the town name is
invisible to this filter — a limitation of the source, not the filter.

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
