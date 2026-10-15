/**
 * The `reports` collection and its two projections.
 *
 * Only the console may see `reporterName`, `reporterContact` and the raw audit
 * trail back-to-back; a citizen looking up their own reference code gets
 * `PublicReport`, which drops the two contact fields. That split is enforced
 * here, in one pair of mappers, rather than by whichever route remembers.
 */
import mongoose from 'mongoose';
import type { HydratedDocument, Model } from 'mongoose';
import { REPORT_CATEGORIES, REPORT_PRIORITIES, REPORT_STATUSES } from '@betterlabo/shared';
import type {
  PublicReport,
  Report,
  ReportCategory,
  ReportEvent,
  ReportPriority,
  ReportStatus,
} from '@betterlabo/shared';

export type ReportActor = ReportEvent['actor'];

export interface ReportLocationAttrs {
  lat: number;
  lng: number;
}

export interface ReportEventAttrs {
  at: Date;
  actor: ReportActor;
  action: string;
  note: string | null;
}

export interface ReportAttrs {
  referenceCode: string;
  category: ReportCategory;
  status: ReportStatus;
  priority: ReportPriority;
  barangayPsgc: string;
  barangayName: string;
  subject: string;
  details: string;
  locationLabel: string;
  location: ReportLocationAttrs | null;
  reporterName: string | null;
  reporterContact: string | null;
  /** The reporter explicitly allowed the LGU to contact them back. */
  contactConsent: boolean;
  assignedOffice: string | null;
  resolutionNote: string | null;
  /** Server-side audit trail, newest last. */
  history: ReportEventAttrs[];
  createdAt: Date;
  updatedAt: Date;
}

export type ReportDocument = HydratedDocument<ReportAttrs>;

const eventSchema = new mongoose.Schema<ReportEventAttrs>(
  {
    at: { type: Date, required: true },
    actor: { type: String, required: true, enum: ['citizen', 'system', 'console'] },
    action: { type: String, required: true, trim: true, maxlength: 200 },
    note: { type: String, default: null, maxlength: 2000 },
  },
  { _id: false },
);

const locationSchema = new mongoose.Schema<ReportLocationAttrs>(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

const reportSchema = new mongoose.Schema<ReportAttrs>(
  {
    referenceCode: { type: String, required: true, unique: true, trim: true },
    category: { type: String, required: true, enum: [...REPORT_CATEGORIES] },
    status: { type: String, required: true, enum: [...REPORT_STATUSES], default: 'received' },
    priority: { type: String, required: true, enum: [...REPORT_PRIORITIES], default: 'normal' },
    barangayPsgc: { type: String, required: true, trim: true, index: true },
    barangayName: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    details: { type: String, required: true },
    locationLabel: { type: String, required: true, trim: true },
    location: { type: locationSchema, default: null },
    reporterName: { type: String, default: null },
    reporterContact: { type: String, default: null },
    contactConsent: { type: Boolean, required: true, default: false },
    assignedOffice: { type: String, default: null },
    resolutionNote: { type: String, default: null },
    history: { type: [eventSchema], default: [] },
  },
  { timestamps: true, versionKey: false, collection: 'reports' },
);

reportSchema.index({ createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ category: 1, createdAt: -1 });

export const ReportModel: Model<ReportAttrs> =
  (mongoose.models['Report'] as Model<ReportAttrs> | undefined) ??
  mongoose.model<ReportAttrs>('Report', reportSchema);

function toReportEvent(event: ReportEventAttrs): ReportEvent {
  return {
    at: event.at.toISOString(),
    actor: event.actor,
    action: event.action,
    note: event.note ?? null,
  };
}

/** Console projection — the full record. */
export function toReport(doc: ReportDocument): Report {
  return {
    id: String(doc._id),
    referenceCode: doc.referenceCode,
    category: doc.category,
    status: doc.status,
    priority: doc.priority,
    barangayPsgc: doc.barangayPsgc,
    barangayName: doc.barangayName,
    subject: doc.subject,
    details: doc.details,
    locationLabel: doc.locationLabel,
    location: doc.location ? { lat: doc.location.lat, lng: doc.location.lng } : null,
    reporterName: doc.reporterName ?? null,
    reporterContact: doc.reporterContact ?? null,
    assignedOffice: doc.assignedOffice ?? null,
    resolutionNote: doc.resolutionNote ?? null,
    history: (doc.history ?? []).map(toReportEvent),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Public projection — the report with its reporter's identity removed. Written
 * out field by field on purpose: a future field added to `Report` must be a
 * deliberate decision to publish, not an accident of spreading.
 */
export function toPublicReport(doc: ReportDocument): PublicReport {
  const report = toReport(doc);
  return {
    id: report.id,
    referenceCode: report.referenceCode,
    category: report.category,
    status: report.status,
    priority: report.priority,
    barangayPsgc: report.barangayPsgc,
    barangayName: report.barangayName,
    subject: report.subject,
    details: report.details,
    locationLabel: report.locationLabel,
    location: report.location,
    assignedOffice: report.assignedOffice,
    resolutionNote: report.resolutionNote,
    history: report.history,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}
