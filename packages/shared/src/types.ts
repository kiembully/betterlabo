/**
 * Every shape that crosses a wire — the Express API, the Next server, the
 * browser and the ETL all import from here so the contract cannot drift.
 * Dates are ISO-8601 strings, never `Date` objects.
 */

import type {
  ReportCategory,
  ReportPriority,
  ReportStatus,
} from './constants.js';

/* ─────────────────────────── envelopes ─────────────────────────── */

export interface ApiError {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export const API_ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'not_found',
  'unauthorized',
  'forbidden',
  'rate_limited',
  'captcha_failed',
  'db_unavailable',
  'conflict',
  'internal',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ListEnvelope<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ItemEnvelope<T> {
  item: T;
}

export interface OkEnvelope {
  ok: true;
}

/* ─────────────────────────── citizen reports ─────────────────────────── */

export interface ReportLocation {
  lat: number;
  lng: number;
}

export interface Report {
  id: string;
  /** Human-quotable code, e.g. `LB-2026-000042`. */
  referenceCode: string;
  category: ReportCategory;
  status: ReportStatus;
  priority: ReportPriority;
  barangayPsgc: string;
  barangayName: string;
  subject: string;
  details: string;
  locationLabel: string;
  location: ReportLocation | null;
  reporterName: string | null;
  reporterContact: string | null;
  assignedOffice: string | null;
  resolutionNote: string | null;
  /** Server-side audit trail, newest last. Visible to the console only. */
  history: ReportEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ReportEvent {
  at: string;
  actor: 'citizen' | 'system' | 'console';
  action: string;
  note: string | null;
}

/** Public view of a report — what a citizen gets back from `/api/reports/lookup`. */
export type PublicReport = Omit<
  Report,
  'reporterName' | 'reporterContact' | 'history'
> & {
  history: ReportEvent[];
};

export interface CreateReportInput {
  category: ReportCategory;
  barangayPsgc: string;
  subject: string;
  details: string;
  locationLabel: string;
  location?: ReportLocation | null;
  reporterName?: string | null;
  reporterContact?: string | null;
  contactConsent?: boolean;
  /** Cloudflare Turnstile token; required when TURNSTILE_MODE=enforce. */
  turnstileToken?: string | null;
  /** Honeypot — must be empty. Bots fill it. */
  website?: string | null;
}

export interface UpdateReportInput {
  status?: ReportStatus;
  priority?: ReportPriority;
  assignedOffice?: string | null;
  resolutionNote?: string | null;
}

export interface ListReportsQuery {
  status?: ReportStatus;
  category?: ReportCategory;
  barangayPsgc?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export interface ReportStats {
  total: number;
  open: number;
  resolved: number;
  last30Days: number;
  byStatus: Array<{ status: ReportStatus; count: number }>;
  byCategory: Array<{ category: ReportCategory; count: number }>;
  byBarangay: Array<{ barangayPsgc: string; barangayName: string; count: number }>;
}

/* ─────────────────────────── cached static data ─────────────────────────── */

/** One entry of `public/data/barangays.json`. */
export interface BarangayRecord {
  psgcCode: string;
  psgcId: string;
  name: string;
  /** "Pob." suffix in the PSA name — the poblacion core. */
  isPoblacion: boolean;
  areaSqKm: number;
  centroid: ReportLocation;
  bbox: [number, number, number, number];
  /** Population from the PSA census extract, when one has been supplied. */
  population: number | null;
  populationSource: string | null;
  populationYear: number | null;
  hasGeometry: boolean;
}

export interface BarangayIndex {
  municipality: string;
  municipalityPsgcCode: string;
  generatedAt: string;
  count: number;
  barangays: BarangayRecord[];
  totalAreaSqKm: number;
  populationCoverage: number;
  note: string;
}

/** One row of `public/data/fiscal.json`. */
export interface FiscalFigure {
  label: string;
  /** PHP, nominal. `null` means "not reported in the source", never zero. */
  amount: number | null;
  sharePercent: number | null;
  note?: string | null;
}

export interface FiscalSheet {
  id: string;
  title: string;
  fiscalYear: number;
  /** `PHP` for amounts, `%` for ratios such as IRA/NTA dependency. */
  unit: 'PHP' | '%';
  /** BLGF sheet, row and column range this section was compiled from. */
  basis: string;
  total: number | null;
  figures: FiscalFigure[];
  sourceId: string;
  /**
   * Ids of other sections whose totals are included in this section's total
   * because the source header nests them one level deeper.
   */
  subSections?: string[];
  /** Set when the source's own total disagrees with its listed components. */
  note: string | null;
}

export interface FiscalSnapshot {
  municipality: string;
  municipalityPsgcCode: string;
  fiscalYear: number;
  /** The source marks this fiscal year "Preliminary". */
  preliminary: boolean;
  generatedAt: string;
  sheets: FiscalSheet[];
  note: string;
  sources: string[];
}

/** One row of `public/data/projects.json`. */
export interface ProjectRecord {
  id: string;
  description: string;
  category: string | null;
  status: string | null;
  contractor: string | null;
  amount: number | null;
  sourceOfFunds: string | null;
  year: number | null;
  barangay: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceId: string;
}

/** One entry of `public/data/datasets.json` — the provenance registry. */
export interface DatasetProvenance {
  id: string;
  title: string;
  publisher: string;
  portalDatasetId: number | null;
  portalUrl: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string | null;
  attributionText: string;
  retrievedAt: string;
  /** ISO date of the upstream release used. */
  sourceVersion: string | null;
  rowCount: number | null;
  bytes: number | null;
  sha256: string | null;
  outputs: string[];
  notes: string | null;
  /** `true` when the ETL could not fetch this source in the last run. */
  unavailable: boolean;
}

export interface DatasetRegistry {
  generatedAt: string;
  municipality: string;
  datasets: DatasetProvenance[];
  pendingFields: Array<{ field: string; reason: string }>;
}

/** `public/data/hazards.json` — describes which hazard layers are actually present. */
export interface HazardLayerMeta {
  id: 'flood_5yr' | 'flood_25yr' | 'flood_100yr' | 'landslide' | 'debris_flow' | 'storm_surge';
  label: string;
  file: string | null;
  featureCount: number | null;
  /**
   * `static`    = clipped GeoJSON committed in this repo
   * `remote`    = streamed from the published PMTiles archive by range request
   * `absent`    = could not be compiled in this run (the note says why)
   * `none-in-area` = compiled and analysed, and Labo genuinely has no coverage
   */
  mode: 'static' | 'remote' | 'absent' | 'none-in-area';
  remoteUrl: string | null;
  sourceId: string;
  note: string | null;
}

export interface HazardRegistry {
  generatedAt: string;
  municipality: string;
  layers: HazardLayerMeta[];
  note: string;
  sources: string[];
}

/** `public/data/barangay-exposure.json` — per-barangay hazard classification. */
export interface BarangayExposure {
  psgcCode: string;
  name: string;
  /** Highest hazard class found per layer id, or null when no hazard is mapped. */
  exposure: Record<string, number | null>;
  /** How many mapped hazard patches matched, so the strength of the signal is visible. */
  patchCounts: Record<string, number>;
}

export interface BarangayExposureRegistry {
  municipality: string;
  method: string;
  classLegend: Record<string, string>;
  layers: Array<{ id: string; label: string }>;
  counts: {
    barangays: number;
    withAnyExposure: number;
    withoutAnyExposure: number;
    patchesTested: number;
  };
  barangays: BarangayExposure[];
  sources: string[];
}

/** `public/data/profile.json` */
export interface MunicipalityProfile {
  name: string;
  officialName: string;
  psgcCode: string;
  psgcId: string;
  province: string;
  provincePsgcCode: string;
  region: string;
  islandGroup: string;
  /** Null until a classification source is wired; never guessed. */
  incomeClass: string | null;
  areaSqKm: number | null;
  barangayCount: number;
  centroid: ReportLocation;
  bounds: [number, number, number, number];
  counts: {
    poblacion: number;
    inland: number;
    withPopulationData: number;
  };
  largestBarangays: Array<{ name: string; areaSqKm: number }>;
  generatedAt: string;
  note: string;
  sources: string[];
  /** Fields the brief asks for but no verified source has been wired yet. */
  pendingFields: Array<{ field: string; reason: string }>;
}

/** A snapshot reference, so every scraped value can name where and when it came from. */
export interface LguSnapshotRef {
  timestamp: string;
  date: string | null;
  iso?: string | null;
  url: string;
  liveUrl?: string;
}

/**
 * A person or office on the LGU's own officials page.
 *
 * `name` is nullable on purpose: the current capture of that page names no mayor
 * and no vice mayor, only their offices. When the name could only be recovered
 * from an older capture, `nameAsOf` carries that older date and
 * `nameRemovedFromCurrentPage` is true — the UI must never present it as current.
 */
export interface LguOfficial {
  name: string | null;
  position: string | null;
  office: string | null;
  address: string | null;
  floor: string | null;
  phone: string | null;
  nameAsOf?: string | null;
  nameSourceUrl?: string | null;
  nameRemovedFromCurrentPage?: boolean;
}

export interface LguLegislativeMember {
  name: string;
  role: string | null;
  roleAsPublished: string | null;
  kind: 'vice-mayor' | 'councilor' | 'ex-officio';
  exOfficioBody: string | null;
  asOf: string | null;
}

export interface LguOffice {
  name: string;
  address: string | null;
  cluster?: string;
}

/** `public/data/lgu.json` — compiled from labo.gov.ph via the Wayback Machine. */
export interface LguRecord {
  municipality: string;
  province: string;
  source: {
    name: string;
    url: string;
    publisher: string;
    license: string;
    accessedVia: string;
  };
  snapshots: Record<string, LguSnapshotRef | null>;
  officials: {
    executive: LguOfficial[];
    departmentHeads: LguOfficial[];
    sectionHeads: LguOfficial[];
    counts: {
      executiveOffices: number;
      departmentHeads: number;
      sectionHeads: number;
      named: number;
    };
    notices: string[];
  };
  legislative: {
    asOf: string | null;
    note: string;
    members: LguLegislativeMember[];
    vacantSeats: Array<{ body: string; label: string }>;
    counts: { total: number; councilors: number; exOfficio: number; vacantSeats: number };
  };
  profile: {
    areaKm2: number | null;
    provinceSharePercent: number | null;
    agriculturalKm2: number | null;
    barangays: string[];
    sections: Record<string, string[]>;
  } | null;
  offices: {
    note: string;
    clusters: Array<{ name: string; slug: string; description: string }>;
    byCluster: Array<{
      cluster: string;
      name: string | null;
      sourceUrl: string;
      snapshot: { date: string | null; url: string } | null;
      officeCount: number;
      note: string | null;
      offices: Array<{ name: string; address: string | null }>;
    }>;
    count: number;
    all: LguOffice[];
  };
  barangayCrossCheck: {
    siteCount: number;
    compiledCount: number;
    matched: number;
    onlyOnSite: string[];
    onlyInPsgc: string[];
    agrees: boolean;
    note: string;
  } | null;
  dataHash?: string;
  generatedAt?: string;
}

/** `public/data/lgu-documents.json` — the LGU's published document index. */
export interface LguDocumentIndex {
  municipality: string;
  note: string;
  sourceIndex: string;
  count: number;
  byKind: Record<string, number>;
  items: Array<{
    slug: string;
    title: string;
    titleDerived: boolean;
    kind: string;
    path: string;
    url: string;
    lastSeen: string | null;
  }>;
  dataHash?: string;
  generatedAt?: string;
}
