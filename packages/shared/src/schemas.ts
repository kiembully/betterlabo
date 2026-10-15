import { z } from 'zod';

import {
  REPORT_CATEGORIES,
  REPORT_LIMITS,
  REPORT_PRIORITIES,
  REPORT_STATUSES,
} from './constants.js';

/* ─────────────────────────── primitives ─────────────────────────── */

export const psgcCodeSchema = z
  .string()
  .regex(/^\d{10}$/, 'PSGC code must be 10 digits')
  .describe('PSA Philippine Standard Geographic Code');

export const isoDateSchema = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO-8601 date');

export const reportCategorySchema = z.enum(REPORT_CATEGORIES);
export const reportStatusSchema = z.enum(REPORT_STATUSES);
export const reportPrioritySchema = z.enum(REPORT_PRIORITIES);

/** Rejects text made only of whitespace, emoji spam or a single character. */
const meaningfulText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be at most ${max} characters`)
    .refine((v) => /\p{L}/u.test(v), `${label} must contain letters`);

/** Loose PH phone / email check — deliberately permissive, it is not auth. */
const contactSchema = z
  .string()
  .trim()
  .max(REPORT_LIMITS.reporterContactMax)
  .refine(
    (v) =>
      /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(v) ||
      /^(\+?63|0)?[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d{4}$/.test(v.replace(/[\s-]/g, '')),
    'Provide an email address or a Philippine mobile / landline number',
  );

/* ─────────────────────────── citizen reports ─────────────────────────── */

export const reportLocationSchema = z.object({
  lat: z.number().gte(-90).lte(90),
  lng: z.number().gte(-180).lte(180),
});

export const createReportSchema = z
  .object({
    category: reportCategorySchema,
    barangayPsgc: psgcCodeSchema,
    subject: meaningfulText(5, REPORT_LIMITS.subjectMax, 'Subject'),
    details: meaningfulText(REPORT_LIMITS.minDetails, REPORT_LIMITS.detailsMax, 'Details'),
    locationLabel: meaningfulText(3, REPORT_LIMITS.locationLabelMax, 'Location'),
    location: reportLocationSchema.nullish(),
    reporterName: z
      .string()
      .trim()
      .max(REPORT_LIMITS.reporterNameMax)
      .nullish()
      .transform((v) => (v === '' ? null : (v ?? null))),
    reporterContact: z
      .union([contactSchema, z.literal('')])
      .nullish()
      .transform((v) => (v === '' || v == null ? null : v)),
    contactConsent: z.boolean().default(false),
    turnstileToken: z.string().max(4096).nullish(),
    /** Honeypot. Any non-empty value means a bot. */
    website: z.string().max(200).nullish(),
  })
  .refine((v) => !v.website || v.website.trim() === '', {
    message: 'Rejected',
    path: ['website'],
  });

export type CreateReportRequest = z.input<typeof createReportSchema>;

export const updateReportSchema = z
  .object({
    status: reportStatusSchema.optional(),
    priority: reportPrioritySchema.optional(),
    assignedOffice: z.string().trim().max(160).nullish(),
    resolutionNote: z.string().trim().max(2000).nullish(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Provide at least one field to update',
  });

export const listReportsQuerySchema = z.object({
  status: reportStatusSchema.optional(),
  category: reportCategorySchema.optional(),
  barangayPsgc: psgcCodeSchema.optional(),
  q: z.string().trim().max(160).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const lookupReportSchema = z.object({
  referenceCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^LB-\d{4}-\d{6}$/, 'Reference codes look like LB-2026-000042'),
});

/* ─────────────────────────── cached static data ─────────────────────────── */

export const barangayRecordSchema = z.object({
  psgcCode: psgcCodeSchema,
  psgcId: z.string().regex(/^PH\d{10}$/),
  name: z.string().min(1),
  isPoblacion: z.boolean(),
  areaSqKm: z.number().nonnegative(),
  centroid: reportLocationSchema,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  population: z.number().int().nonnegative().nullable(),
  populationSource: z.string().nullable(),
  populationYear: z.number().int().nullable(),
  hasGeometry: z.boolean(),
});

export const barangayIndexSchema = z.object({
  municipality: z.string().min(1),
  municipalityPsgcCode: psgcCodeSchema,
  generatedAt: isoDateSchema,
  count: z.number().int().positive(),
  barangays: z.array(barangayRecordSchema),
});

/** One GeoJSON feature's properties, as emitted by the ETL. */
export const barangayFeaturePropsSchema = z.object({
  psgc_code: psgcCodeSchema,
  name: z.string().min(1),
  area_sqkm: z.number(),
  is_poblacion: z.boolean(),
  municipality: z.literal('Labo'),
  province: z.string(),
});

export type BarangayFeatureProps = z.infer<typeof barangayFeaturePropsSchema>;

export const datasetProvenanceSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  publisher: z.string().min(1),
  portalDatasetId: z.number().int().nullable(),
  portalUrl: z.string().url(),
  sourceUrl: z.string().url(),
  license: z.string().min(1),
  licenseUrl: z.string().url().nullable(),
  attributionText: z.string(),
  retrievedAt: isoDateSchema,
  sourceVersion: z.string().nullable(),
  rowCount: z.number().int().nullable(),
  bytes: z.number().int().nullable(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).nullable(),
  outputs: z.array(z.string()),
  notes: z.string().nullable(),
  unavailable: z.boolean(),
});

export const datasetRegistrySchema = z.object({
  generatedAt: isoDateSchema,
  municipality: z.string().min(1),
  datasets: z.array(datasetProvenanceSchema),
});
