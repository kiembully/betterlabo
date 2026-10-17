/**
 * All appointment persistence, in one module.
 *
 * Routes stay thin (parse, authorise, shape the response) and both entry points
 * — the public request form and the console — go through the same write path, so
 * reference-code allocation, default routing and the audit trail cannot diverge
 * between them.
 *
 * Nothing here promotes a request to a booking on its own: only an explicit
 * console `scheduledDate` does that, which is what keeps the public page's
 * promise ("a request, not a confirmed slot") true.
 */
import { APPOINTMENT_DEFAULT_OFFICE } from '@betterlabo/shared';
import type {
  CreateAppointmentInput,
  ListAppointmentsQuery,
  UpdateAppointmentInput,
} from '@betterlabo/shared';
import type { BarangayRegistry } from '../barangays.js';
import { fail } from '../errors.js';
import { allocateAppointmentReferenceCode } from '../lib/reference-code.js';
import { AppointmentModel } from '../models/appointment.js';
import type { AppointmentDocument, AppointmentEventAttrs } from '../models/appointment.js';

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;
const REFERENCE_CODE_ATTEMPTS = 3;

export interface CreateAppointmentContext {
  registry: BarangayRegistry;
  /** Who is filing: the citizen form, or a console operator on their behalf. */
  source: 'citizen' | 'console';
}

export interface AppointmentListResult {
  items: AppointmentDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface UpdateAppointmentResult {
  doc: AppointmentDocument;
  changed: string[];
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}

/**
 * Creates an appointment request. Membership of the barangay PSGC code is only
 * enforced when the compiled index is actually loaded — with no index the API
 * accepts the well-formed code rather than rejecting every resident.
 */
export async function createAppointment(
  input: CreateAppointmentInput,
  context: CreateAppointmentContext,
): Promise<AppointmentDocument> {
  const barangay = context.registry.get(input.barangayPsgc);
  if (context.registry.size > 0 && !barangay) {
    throw fail.validationFailed(`"${input.barangayPsgc}" is not a barangay of Labo.`, [
      { path: 'barangayPsgc', message: 'Unknown barangay PSGC code for this municipality.', code: 'custom' },
    ]);
  }

  const now = new Date();
  const assignedOffice = APPOINTMENT_DEFAULT_OFFICE[input.purpose] ?? null;
  const history: AppointmentEventAttrs[] = [
    { at: now, actor: context.source, action: 'requested', note: null },
  ];
  if (assignedOffice) {
    history.push({
      at: now,
      actor: 'system',
      action: 'auto_routed',
      note: `Likely office for ${input.purpose}: ${assignedOffice}`,
    });
  }

  for (let attempt = 0; attempt < REFERENCE_CODE_ATTEMPTS; attempt += 1) {
    const referenceCode = await allocateAppointmentReferenceCode(now);
    try {
      return await AppointmentModel.create({
        referenceCode,
        fullName: input.fullName,
        contact: input.contact,
        barangayPsgc: input.barangayPsgc,
        barangayName: barangay?.name ?? input.barangayPsgc,
        purpose: input.purpose,
        status: 'requested',
        preferredDate: input.preferredDate,
        preferredSlot: input.preferredSlot,
        scheduledDate: null,
        scheduledSlot: null,
        notes: input.notes ?? null,
        assignedOffice,
        history,
      });
    } catch (err) {
      if (isDuplicateKey(err) && attempt < REFERENCE_CODE_ATTEMPTS - 1) continue;
      throw err;
    }
  }

  throw fail.conflict('Could not allocate a unique reference code. Please try again.');
}

/**
 * Mongo filter for the console list. `from`/`to` bound the *requested* date, and
 * `q` searches within appointments, never across.
 */
export function buildAppointmentFilter(query: ListAppointmentsQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (query.status) filter['status'] = query.status;

  const dateRange: Record<string, string> = {};
  if (query.from) dateRange['$gte'] = query.from;
  if (query.to) dateRange['$lte'] = query.to;
  if (Object.keys(dateRange).length > 0) filter['preferredDate'] = dateRange;

  const term = query.q?.trim();
  if (term) {
    const pattern = new RegExp(escapeRegExp(term), 'i');
    filter['$or'] = [
      { referenceCode: pattern },
      { fullName: pattern },
      { purpose: pattern },
    ];
  }
  return filter;
}

export async function listAppointments(
  query: ListAppointmentsQuery,
): Promise<AppointmentListResult> {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;
  const filter = buildAppointmentFilter(query);

  const [items, total] = await Promise.all([
    AppointmentModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip(offset).limit(limit).exec(),
    AppointmentModel.countDocuments(filter).exec(),
  ]);

  return { items, total, limit, offset };
}

export async function findAppointmentById(id: string): Promise<AppointmentDocument | null> {
  if (!OBJECT_ID_PATTERN.test(id)) return null;
  return AppointmentModel.findById(id).exec();
}

export async function findAppointmentByReferenceCode(
  referenceCode: string,
): Promise<AppointmentDocument | null> {
  return AppointmentModel.findOne({ referenceCode: referenceCode.trim().toUpperCase() }).exec();
}

/**
 * Applies a console edit. Only fields that actually change are written, and a
 * no-op patch does not add a history entry — an audit trail that records
 * non-events is worse than none.
 *
 * The status is validated by the zod schema before it reaches here, so an
 * unknown status can never be written.
 */
export async function updateAppointment(
  id: string,
  input: UpdateAppointmentInput,
): Promise<UpdateAppointmentResult> {
  const doc = await findAppointmentById(id);
  if (!doc) throw fail.notFound(`No appointment with id "${id}".`);

  const changed: string[] = [];

  if (input.status !== undefined && input.status !== doc.status) {
    changed.push(`status: ${doc.status} → ${input.status}`);
    doc.status = input.status;
  }
  if (input.scheduledDate !== undefined && input.scheduledDate !== doc.scheduledDate) {
    changed.push(`scheduledDate: ${doc.scheduledDate ?? '—'} → ${input.scheduledDate ?? '—'}`);
    doc.scheduledDate = input.scheduledDate;
  }
  if (input.scheduledSlot !== undefined && input.scheduledSlot !== doc.scheduledSlot) {
    changed.push(`scheduledSlot: ${doc.scheduledSlot ?? '—'} → ${input.scheduledSlot ?? '—'}`);
    doc.scheduledSlot = input.scheduledSlot;
  }
  if (input.assignedOffice !== undefined && input.assignedOffice !== doc.assignedOffice) {
    changed.push(`assignedOffice: ${doc.assignedOffice ?? '—'} → ${input.assignedOffice ?? '—'}`);
    doc.assignedOffice = input.assignedOffice;
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

export async function deleteAppointment(id: string): Promise<AppointmentDocument> {
  const doc = await findAppointmentById(id);
  if (!doc) throw fail.notFound(`No appointment with id "${id}".`);
  await doc.deleteOne();
  return doc;
}
