/**
 * The `appointments` collection and its two projections.
 *
 * Only the console may see `fullName` and `contact`; a citizen looking up their
 * own reference code gets `PublicAppointment`, which drops both. That split is
 * enforced here, in one pair of mappers, rather than by whichever route
 * remembers — the same contract the `reports` collection keeps.
 *
 * A stored appointment is a *request for a slot*. It is not a confirmed booking
 * until the console sets `scheduledDate`, and `null` on that field must stay
 * `null` all the way to the screen: rendering it as "today" or as an empty
 * string would tell a resident they have an appointment they do not have.
 */
import mongoose from 'mongoose';
import type { HydratedDocument, Model } from 'mongoose';
import { APPOINTMENT_PURPOSES, APPOINTMENT_SLOTS, APPOINTMENT_STATUSES } from '@betterlabo/shared';
import type {
  Appointment,
  AppointmentEvent,
  AppointmentPurpose,
  AppointmentSlot,
  AppointmentStatus,
  PublicAppointment,
} from '@betterlabo/shared';

export type AppointmentActor = AppointmentEvent['actor'];

export interface AppointmentEventAttrs {
  at: Date;
  actor: AppointmentActor;
  action: string;
  note: string | null;
}

export interface AppointmentAttrs {
  referenceCode: string;
  fullName: string;
  contact: string;
  barangayPsgc: string;
  barangayName: string;
  purpose: AppointmentPurpose;
  status: AppointmentStatus;
  /** `YYYY-MM-DD`, Asia/Manila calendar date. */
  preferredDate: string;
  preferredSlot: AppointmentSlot;
  /** Set by the console once the office commits. `null` = not scheduled yet. */
  scheduledDate: string | null;
  scheduledSlot: AppointmentSlot | null;
  notes: string | null;
  assignedOffice: string | null;
  /** Server-side audit trail, newest last. */
  history: AppointmentEventAttrs[];
  createdAt: Date;
  updatedAt: Date;
}

export type AppointmentDocument = HydratedDocument<AppointmentAttrs>;

const eventSchema = new mongoose.Schema<AppointmentEventAttrs>(
  {
    at: { type: Date, required: true },
    actor: { type: String, required: true, enum: ['citizen', 'system', 'console'] },
    action: { type: String, required: true, trim: true, maxlength: 200 },
    note: { type: String, default: null, maxlength: 2000 },
  },
  { _id: false },
);

const appointmentSchema = new mongoose.Schema<AppointmentAttrs>(
  {
    referenceCode: { type: String, required: true, unique: true, trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    contact: { type: String, required: true, trim: true, maxlength: 160 },
    barangayPsgc: { type: String, required: true, trim: true, index: true },
    barangayName: { type: String, required: true, trim: true },
    purpose: { type: String, required: true, enum: [...APPOINTMENT_PURPOSES] },
    status: { type: String, required: true, enum: [...APPOINTMENT_STATUSES], default: 'requested' },
    preferredDate: { type: String, required: true, trim: true },
    preferredSlot: { type: String, required: true, enum: [...APPOINTMENT_SLOTS] },
    scheduledDate: { type: String, default: null, trim: true },
    scheduledSlot: { type: String, default: null, enum: [...APPOINTMENT_SLOTS, null] },
    notes: { type: String, default: null, maxlength: 2000 },
    assignedOffice: { type: String, default: null },
    history: { type: [eventSchema], default: [] },
  },
  { timestamps: true, versionKey: false, collection: 'appointments' },
);

appointmentSchema.index({ createdAt: -1 });
appointmentSchema.index({ status: 1, createdAt: -1 });
appointmentSchema.index({ preferredDate: 1 });

export const AppointmentModel: Model<AppointmentAttrs> =
  (mongoose.models['Appointment'] as Model<AppointmentAttrs> | undefined) ??
  mongoose.model<AppointmentAttrs>('Appointment', appointmentSchema);

function toAppointmentEvent(event: AppointmentEventAttrs): AppointmentEvent {
  return {
    at: event.at.toISOString(),
    actor: event.actor,
    action: event.action,
    note: event.note ?? null,
  };
}

/** Console projection — the full record. */
export function toAppointment(doc: AppointmentDocument): Appointment {
  return {
    id: String(doc._id),
    referenceCode: doc.referenceCode,
    fullName: doc.fullName,
    contact: doc.contact,
    barangayPsgc: doc.barangayPsgc,
    barangayName: doc.barangayName,
    purpose: doc.purpose,
    status: doc.status,
    preferredDate: doc.preferredDate,
    preferredSlot: doc.preferredSlot,
    scheduledDate: doc.scheduledDate ?? null,
    scheduledSlot: doc.scheduledSlot ?? null,
    notes: doc.notes ?? null,
    assignedOffice: doc.assignedOffice ?? null,
    history: (doc.history ?? []).map(toAppointmentEvent),
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/**
 * Public projection — the appointment with the applicant's identity removed.
 *
 * Written out field by field on purpose: a future field added to `Appointment`
 * must be a deliberate decision to publish, not an accident of spreading. The
 * citizen still sees the status, the office and the booked date/slot — never
 * their own contact details echoed back, and never anyone else's.
 */
export function toPublicAppointment(doc: AppointmentDocument): PublicAppointment {
  const appointment = toAppointment(doc);
  return {
    id: appointment.id,
    referenceCode: appointment.referenceCode,
    barangayPsgc: appointment.barangayPsgc,
    barangayName: appointment.barangayName,
    purpose: appointment.purpose,
    status: appointment.status,
    preferredDate: appointment.preferredDate,
    preferredSlot: appointment.preferredSlot,
    scheduledDate: appointment.scheduledDate,
    scheduledSlot: appointment.scheduledSlot,
    notes: appointment.notes,
    assignedOffice: appointment.assignedOffice,
    history: appointment.history,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}
