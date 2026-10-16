/**
 * Domain constants for the Municipality of Labo, Camarines Norte.
 *
 * Every identifier here is a real, verifiable code — no invented values:
 *  - `psgcCode` / `psgcId` come from the PSA Philippine Standard Geographic Code
 *    (2023-10-24 snapshot) as published with the Philippine Barangay Boundaries
 *    dataset on data.bettergov.ph. Labo is PSGC 0501606000 / PH0501606.
 *  - `areaSqKm` is the NAMRIA-derived polygon area shipped in the same dataset.
 *  - `barangayCount` is not asserted from a spec: `scripts/verify-data.mjs` fails
 *    the build if the compiled barangay file does not contain exactly this many
 *    features, so a silent upstream change cannot slip through.
 */

export const LABO = {
  name: 'Labo',
  officialName: 'Municipality of Labo',
  psgcId: 'PH0501606',
  psgcCode: '0501606000',
  province: 'Camarines Norte',
  provincePsgcId: 'PH05016',
  provincePsgcCode: '0501600000',
  region: 'Region V (Bicol Region)',
  regionPsgcId: 'PH05',
  islandGroup: 'Luzon',
  incomeClass: '1st',
  areaSqKm: 628.706957508,
  barangayCount: 52,
  /** Anchor used before the ETL-computed centroid is available. */
  fallbackCenter: { lat: 14.1526, lng: 122.8297 },
} as const;

/** Minimum plausible zoom for the Labo outline. */
export const LABO_MAP = {
  center: { lat: 14.1526, lng: 122.8297 },
  zoom: 10.4,
  minZoom: 8,
  maxZoom: 17,
  /**
   * Basemap, and why it is not CARTO any more.
   *
   * CARTO's `basemaps.cartocdn.com` endpoint used to serve keyless raster tiles.
   * It now answers `200` with a 2 KB image that is entirely an "API KEY REQUIRED"
   * watermark — the request succeeds, so nothing errors, and the map silently
   * renders as a white rectangle with a watermark across it. Verified by fetching a
   * real Labo tile: 2,049 bytes versus 18,109 for OSM's.
   *
   * OpenFreeMap is a keyless vector-tile basemap: no API key, no registration, no
   * request limits, and it carries its own glyphs (so the barangay-label layer no
   * longer needs a font download from MapLibre's demo server). Positron is a light,
   * low-contrast style, which is what a data-overlay map wants.
   */
  basemapStyleUrl: 'https://tiles.openfreemap.org/styles/positron',
  /** Keyless raster fallback, used when the vector basemap is switched off. */
  rasterTileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  rasterAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;

/**
 * Citizen report taxonomy. Deliberately aligned with the civic priorities named
 * in the BetterLabo brief: flood/drainage (Busig-on–Labo river basin), roads and
 * public works, disaster response (MDRRMO), health (RHU I & II), and services
 * reaching vulnerable groups including the Manide communities.
 */
export const REPORT_CATEGORIES = [
  'flood_drainage',
  'roads_and_public_works',
  'waste_management',
  'water_supply',
  'streetlights_and_power',
  'disaster_and_emergency',
  'health_and_sanitation',
  'education',
  'agriculture',
  'social_welfare_manide',
  'peace_and_order',
  'other',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  flood_drainage: 'Flooding & drainage',
  roads_and_public_works: 'Roads & public works',
  waste_management: 'Waste management',
  water_supply: 'Water supply',
  streetlights_and_power: 'Streetlights & power',
  disaster_and_emergency: 'Disaster & emergency',
  health_and_sanitation: 'Health & sanitation',
  education: 'Education',
  agriculture: 'Agriculture',
  social_welfare_manide: 'Social welfare (incl. Manide communities)',
  peace_and_order: 'Peace & order',
  other: 'Other',
};

export const REPORT_STATUSES = [
  'received',
  'acknowledged',
  'in_progress',
  'resolved',
  'closed',
  'rejected',
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  received: 'Received',
  acknowledged: 'Acknowledged',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
  rejected: 'Rejected',
};

export const REPORT_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];

/**
 * Default routing table: which municipal office a report category belongs to.
 * Presented in the UI as "likely office" and editable by the console operator —
 * it is a routing hint, not a claim about the LGU's actual internal structure.
 */
export const REPORT_DEFAULT_OFFICE: Record<ReportCategory, string | null> = {
  flood_drainage: 'Municipal Engineering Office (MEO)',
  roads_and_public_works: 'Municipal Engineering Office (MEO)',
  waste_management: 'Municipal Environment & Natural Resources Office (MENRO)',
  water_supply: 'Municipal Engineering Office (MEO)',
  streetlights_and_power: 'Municipal Engineering Office (MEO)',
  disaster_and_emergency: 'MDRRMO',
  health_and_sanitation: 'Rural Health Unit (RHU I / II)',
  education: 'Special Education Fund / DepEd Labo',
  agriculture: 'Municipal Agriculture Office (MAO)',
  social_welfare_manide: 'MSWDO / NCIP Camarines Norte',
  peace_and_order: 'PNP Labo / Municipal Peace and Order Council',
  other: null,
};

/** Explicit, honest limits of the public reporting channel. */
export const REPORT_LIMITS = {
  subjectMax: 120,
  detailsMax: 4000,
  locationLabelMax: 160,
  reporterNameMax: 120,
  reporterContactMax: 160,
  minDetails: 30,
} as const;

export const EMERGENCY_NOTICE =
  'This portal is not an emergency channel. For a life-threatening emergency call the MDRRMO hotline or 911 directly.';

export const DATA_LICENSE = {
  code: 'MIT',
  url: 'https://opensource.org/license/mit',
} as const;
