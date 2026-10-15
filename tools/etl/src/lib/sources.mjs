/**
 * The provenance registry: ONE place where every upstream source is declared.
 *
 * Nothing in this file may be guessed. Every URL was resolved by reading
 * `https://data.bettergov.ph/api/v1/resources?dataset_id=<id>` (the portal's real
 * JSON API) or the upstream release's own asset list, and every license string
 * is copied from the portal's dataset record. If a URL 404s, `etl verify` fails
 * loudly instead of shipping a dataset with a dead citation.
 */

export const PORTAL = {
  name: 'BetterGov.ph Open Data Portal',
  url: 'https://data.bettergov.ph',
  apiDataset: (id) => `https://data.bettergov.ph/api/v1/datasets/${id}`,
  apiResources: (id) => `https://data.bettergov.ph/api/v1/resources?dataset_id=${id}&limit=100&offset=0`,
  datasetPage: (id) => `https://data.bettergov.ph/datasets/${id}`,
};

const REPO = 'https://github.com/bendlikeabamboo/barangay-boundaries-repository';
const BOUNDARY_TAG = 'v2026.4.13.0';
const boundaryAsset = (name) => `${REPO}/releases/download/${BOUNDARY_TAG}/${name}`;

const hf = (repo, path) =>
  `https://huggingface.co/datasets/${repo}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}`;

export const SOURCES = {
  /**
   * Philippine Barangay Boundaries (Hierarchical GeoJSON) — data.bettergov.ph
   * dataset 23. 42,026 barangay polygons nationally; Labo's 52 are selected by
   * `ADM3_PCODE === "PH0501606"`. MIT.
   */
  boundaries: {
    id: 'psgc-barangay-boundaries',
    title: 'Philippine Barangay Boundaries (Hierarchical GeoJSON)',
    publisher: 'Manuel Balmeo (PSA PSGC + NAMRIA boundary layers) via BetterGov.ph',
    portalDatasetId: 23,
    portalUrl: PORTAL.datasetPage(23),
    license: 'MIT',
    licenseUrl: `${REPO}/blob/main/LICENSE`,
    attributionText:
      'Boundary polygons derived from PSA Philippine Standard Geographic Code snapshots (2023-10-24) and NAMRIA administrative-boundary shapefiles (v2023-11-06), packaged by Manuel Balmeo.',
    sourceUrl: boundaryAsset('barangays.geojson'),
    sourceVersion: BOUNDARY_TAG,
    assets: {
      barangays: boundaryAsset('barangays.geojson'),
      municipalities: boundaryAsset('municipalities.geojson'),
      provinces: boundaryAsset('provinces.geojson'),
      regions: boundaryAsset('regions.geojson'),
      manifest: boundaryAsset('manifest.json'),
    },
  },

  /**
   * BLGF local fiscal data — data.bettergov.ph dataset 9. Four sheets are used;
   * each is a per-LGU table that contains a row for "Labo" in "Camarines Norte".
   * Public Domain.
   */
  fiscal: {
    id: 'blgf-lgu-fiscal',
    title: 'BLGF Local Government Unit Fiscal Data',
    publisher: 'Bureau of Local Government Finance (BLGF) via BetterGov.ph',
    portalDatasetId: 9,
    portalUrl: PORTAL.datasetPage(9),
    license: 'Public Domain',
    licenseUrl: null,
    attributionText:
      'Local fiscal data compiled and published by the Bureau of Local Government Finance (BLGF), Department of Finance.',
    sourceVersion: 'FY 2024 (Preliminary)',
    sheets: {
      sre: {
        resourceId: 30,
        title: 'FY 2024 Statement of Receipts and Expenditures by LGU',
        url: 'https://blgf.gov.ph/wp-content/uploads/2025/08/By-LGU-SRE-2024.xlsx',
        inPhp: true,
      },
      ari: {
        resourceId: 31,
        title: 'FY 2024 Annual Regular Income and Dependencies by LGU',
        url: 'https://blgf.gov.ph/wp-content/uploads/2025/06/By-LGU-ARI-and-Dependencies-2024.xlsx',
        inPhp: true,
      },
      sef: {
        resourceId: 44,
        title: 'FY 2024 Special Education Fund Income and Expenditures',
        url: 'https://blgf.gov.ph/wp-content/uploads/2025/06/FY2024-SEF-Income-and-Expenditures.xlsx',
        inPhp: true,
      },
      ldrrmf: {
        resourceId: 41,
        title: 'FY 2024 Local Disaster Risk Reduction Management Fund by LGU',
        url: 'https://blgf.gov.ph/wp-content/uploads/2025/06/FY2024-LDRRMF-by-LGU.xlsx',
        inPhp: true,
      },
    },
  },

  /**
   * DPWH Infrastructure Transparency Dataset — data.bettergov.ph dataset 19.
   * A 24 MB parquet on HuggingFace. CC0.
   */
  dpwh: {
    id: 'dpwh-infrastructure',
    title: 'DPWH Infrastructure Transparency Dataset',
    publisher: 'Department of Public Works and Highways (DPWH) via BetterGov.ph',
    portalDatasetId: 19,
    portalUrl: PORTAL.datasetPage(19),
    license: 'CC0 1.0 Universal',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attributionText:
      'Infrastructure project data from the official DPWH transparency platform, packaged by BetterGov.ph.',
    sourceUrl: hf('bettergovph/dpwh-transparency-data', 'dpwh_transparency_data.parquet'),
    sourceVersion: '2025-11-29',
  },

  /**
   * Project NOAH Hazard Maps — data.bettergov.ph dataset 22, ODbL.
   *
   * Two delivery modes, and the difference is deliberate:
   *  - `provinceArchives` are the original per-province shapefile zips. They are
   *    what `npm run etl hazards` downloads to clip a static GeoJSON for Labo.
   *  - `pmtiles` are the same layers pre-tiled. Because they are 0.5–2.8 GB each,
   *    the clipped-static path is preferred and the PMTiles URL is only streamed
   *    by MapLibre (HTTP range requests) when explicitly configured.
   */
  noah: {
    id: 'noah-hazard-maps',
    title: 'Project NOAH Hazard Maps',
    publisher: 'Project NOAH (Nationwide Operational Assessment of Hazards), DOST',
    portalDatasetId: 22,
    portalUrl: PORTAL.datasetPage(22),
    license: 'ODC-ODbL',
    licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    attributionText:
      'Hazard layers produced by Project NOAH, Department of Science and Technology, Philippines.',
    sourceVersion: '2026-04-11',
    provinceArchives: {
      flood_5yr: hf('bettergovph/project-noah-hazard-maps', 'Flood/5yr/CamarinesNorte.zip'),
      flood_25yr: hf('bettergovph/project-noah-hazard-maps', 'Flood/25yr/CamarinesNorte.zip'),
      flood_100yr: hf('bettergovph/project-noah-hazard-maps', 'Flood/100yr/CamarinesNorte.zip'),
      landslide: hf(
        'bettergovph/project-noah-hazard-maps',
        'Landslide/LandslideHazards/CamarinesNorte.zip',
      ),
      storm_surge: hf(
        'bettergovph/project-noah-hazard-maps',
        'Storm Surge/StormSurgeAdvisory1/CamarinesNorte.zip',
      ),
    },
    pmtiles: {
      flood_5yr: hf('bettergovph/project-noah-hazard-maps', 'PMTiles/layers/flood_5yr.pmtiles'),
      flood_25yr: hf('bettergovph/project-noah-hazard-maps', 'PMTiles/layers/flood_25yr.pmtiles'),
      flood_100yr: hf('bettergovph/project-noah-hazard-maps', 'PMTiles/layers/flood_100yr.pmtiles'),
      landslide: hf('bettergovph/project-noah-hazard-maps', 'PMTiles/layers/landslide.pmtiles'),
      storm_surge: hf(
        'bettergovph/project-noah-hazard-maps',
        'PMTiles/layers/storm_surge_ssa1.pmtiles',
      ),
    },
  },
};

/**
 * Fields the BetterLabo brief names that no wired source provides yet. They are
 * surfaced in the UI as "awaiting source" rather than filled with a guess.
 */
export const PENDING_FIELDS = [
  {
    field: 'Barangay population',
    reason:
      'No barangay-level PSA census extract is published on data.bettergov.ph. Place an official PSA Census of Population file at data/sources/psa-population.csv (headers: psgc_code,population,source,year) and re-run `npm run etl barangays` to attach it.',
  },
  {
    field: 'Annual Investment Plan (AIP) line items',
    reason:
      'The AIP is published per-LGU as a PDF on the LGU website, not as a structured dataset. The FDPP explorer links to the source document instead of transcribing it.',
  },
  {
    field: 'Commission on Audit annual audit report text',
    reason:
      'data.bettergov.ph dataset 14 indexes COA audit-agency listings as PDFs; the Labo-specific report has not been parsed into structured rows.',
  },
  {
    field: 'Elected and appointed officials',
    reason:
      'No open dataset carries current Labo officials with contact details. Left out rather than transcribed from an unverifiable page.',
  },
  {
    field: 'Ordinance index',
    reason: 'No machine-readable source; municipal ordinance PDFs are not published as a dataset.',
  },
];
