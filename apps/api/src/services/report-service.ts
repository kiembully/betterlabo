/**
 * All report persistence, in one module.
 *
 * Routes stay thin (parse, authorise, shape the response) and both entry points
 * — the public intake form and the console — go through the same write path, so
 * reference-code allocation, default routing and the audit trail cannot diverge
 * between them.
 */
import { REPORT_DEFAULT_OFFICE } from '@betterlabo/shared';
import type { CreateReportInput, ListReportsQuery, UpdateReportInput } from '@betterlabo/shared';
import type { BarangayRegistry } from '../barangays.js';
import { fail } from '../errors.js';
import { allocateReferenceCode } from '../lib/reference-code.js';
import { ReportModel } from '../models/report.js';
import type { ReportDocument, ReportEventAttrs } from '../models/report.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const REFERENCE_CODE_ATTEMPTS = 3;

export interface CreateReportContext {
  registry: BarangayRegistry;
  /** Who is filing: the citizen form, or a console operator on their behalf. */
  source: 'citizen' | 'console';
}

export interface ReportListResult {
  items: ReportDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateReportResult {
  doc: ReportDocument;
  changed: string[];
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/**
 * Creates a report. Membership of the barangay PSGC code is only enforced when
 * the compiled index is actually loaded — with no index the API accepts the
 * well-formed code rather than rejecting every citizen.
 */
export async function createReport(
  input: CreateReportInput,
  context: CreateReportContext,
): Promise<ReportDocument> {
  const barangay = context.registry.get(input.barangayPsgc);
  if (context.registry.size > 0 && !barangay) {
    throw fail.validationFailed(`"${input.barangayPsgc}" is not a barangay of Labo.`, [
      { path: 'barangayPsgc', message: 'Unknown barangay PSGC code for this municipality.', code: 'custom' },
    ]);
  }

  const now = new Date();
  const assignedOffice = REPORT_DEFAULT_OFFICE[input.category] ?? null;
  const history: ReportEventAttrs[] = [
    { at: now, actor: context.source, action: 'submitted', note: null },
  ];
  if (assignedOffice) {
    history.push({
      at: now,
      actor: 'system',
      action: 'auto_routed',
      note: `Default office for ${input.category}: ${assignedOffice}`,
    });
  }

  for (let attempt = 0; attempt < REFERENCE_CODE_ATTEMPTS; attempt += 1) {
    const referenceCode = await allocateReferenceCode(now);
    try {
      return await ReportModel.create({
        referenceCode,
        category: input.category,
        status: 'received',
        priority: 'normal',
        barangayPsgc: input.barangayPsgc,
        barangayName: barangay?.name ?? input.barangayPsgc,
        subject: input.subject,
        details: input.details,
        locationLabel: input.locationLabel,
        location: input.location ?? null,
        reporterName: input.reporterName ?? null,
        reporterContact: input.reporterContact ?? null,
        contactConsent: input.contactConsent ?? false,
        assignedOffice,
        resolutionNote: null,
        history,
      });
    } catch (err) {
      if (isDuplicateKey(err) && attempt < REFERENCE_CODE_ATTEMPTS - 1) continue;
      throw err;
    }
  }

  throw fail.conflict('Could not allocate a unique reference code. Please try again.');
}

/** Mongo filter for the console list. `q` searches within reports, never across. */
export function buildReportFilter(query: ListReportsQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter['status'] = query.status;
  if (query.category) filter['category'] = query.category;
  if (query.barangayPsgc) filter['barangayPsgc'] = query.barangayPsgc;

  const term = query.q?.trim();
  if (term) {
    const pattern = new RegExp(escapeRegExp(term), 'i');
    filter['$or'] = [
      { referenceCode: pattern },
      { subject: pattern },
      { details: pattern },
      { locationLabel: pattern },
      { barangayName: pattern },
    ];
  }
  return filter;
}

export async function listReports(query: ListReportsQuery): Promise<ReportListResult> {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  const filter = buildReportFilter(query);

  const [items, total] = await Promise.all([
    ReportModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).exec(),
    ReportModel.countDocuments(filter).exec(),
  ]);

  return { items, total, limit, offset };
}

export async function findReportById(id: string): Promise<ReportDocument | null> {
  if (!OBJECT_ID_PATTERN.test(id)) return null;
  return ReportModel.findById(id).exec();
}

export async function findReportByReferenceCode(
  referenceCode: string,
): Promise<ReportDocument | null> {
  return ReportModel.findOne({ referenceCode: referenceCode.trim().toUpperCase() }).exec();
}

/**
 * Applies a console edit. Only fields that actually change are written, and a
 * no-op patch does not add a history entry — an audit trail that records
 * non-events is worse than none.
 */
export async function updateReport(
  id: string,
  input: UpdateReportInput,
): Promise<UpdateReportResult> {
  const doc = await findReportById(id);
  if (!doc) throw fail.notFound(`No report with id "${id}".`);

  const changed: string[] = [];

  if (input.status !== undefined && input.status !== doc.status) {
    changed.push(`status: ${doc.status} → ${input.status}`);
    doc.status = input.status;
  }
  if (input.priority !== undefined && input.priority !== doc.priority) {
    changed.push(`priority: ${doc.priority} → ${input.priority}`);
    doc.priority = input.priority;
  }
  if (input.assignedOffice !== undefined && input.assignedOffice !== doc.assignedOffice) {
    changed.push(`assignedOffice: ${doc.assignedOffice ?? '—'} → ${input.assignedOffice ?? '—'}`);
    doc.assignedOffice = input.assignedOffice;
  }
  if (input.resolutionNote !== undefined && input.resolutionNote !== doc.resolutionNote) {
    changed.push('resolutionNote updated');
    doc.resolutionNote = input.resolutionNote;
  }

  if (changed.length === 0) return { doc, changed };

  doc.history.push({
    at: new Date(),
    actor: 'console',
    action: 'updated',
    note: changed.join('; '),
  });
  await doc.save();
  return { doc, changed };
}

export async function deleteReport(id: string): Promise<ReportDocument> {
  const doc = await findReportById(id);
  if (!doc) throw fail.notFound(`No report with id "${id}".`);
  await doc.deleteOne();
  return doc;
}
