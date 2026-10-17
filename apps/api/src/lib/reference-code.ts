/**
 * Human-quotable report identifiers: `LB-2026-000042`.
 *
 * The sequence is per municipal year and comes from an atomic `$inc` on a
 * counter document, so two simultaneous submissions can never collide. The year
 * is the Asia/Manila year — a report filed on 1 January at 01:00 PHT must not be
 * numbered into the previous year because the server clock was in UTC.
 */
import { nextSequence } from '../models/counter.js';

export const REFERENCE_CODE_PREFIX = 'LB';
export const REFERENCE_CODE_PATTERN = /^LB-\d{4}-\d{6}$/;

const MANILA_YEAR = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  timeZone: 'Asia/Manila',
});

function municipalYear(date: Date): number {
  return Number.parseInt(MANILA_YEAR.format(date), 10);
}

export function formatReferenceCode(year: number, sequence: number): string {
  return `${REFERENCE_CODE_PREFIX}-${year}-${String(sequence).padStart(6, '0')}`;
}

/** Reserves the next reference code for the municipal year of `now`. */
export async function allocateReferenceCode(now: Date = new Date()): Promise<string> {
  const year = municipalYear(now);
  const sequence = await nextSequence(`report:${year}`);
  return formatReferenceCode(year, sequence);
}

/* ───────────────────────────── appointments ───────────────────────────── */

/**
 * Appointment identifiers: `APT-2026-000001`.
 *
 * A different prefix AND a different counter key (`appointment:<year>`), so the
 * two channels of intake never share a number space. A report and an appointment
 * filed in the same second must not be able to collide, and an operator reading
 * `APT-…` aloud must never be quoting a report.
 */
export const APPOINTMENT_CODE_PREFIX = 'APT';
export const APPOINTMENT_CODE_PATTERN = /^APT-\d{4}-\d{6}$/;

export function formatAppointmentCode(year: number, sequence: number): string {
  return `${APPOINTMENT_CODE_PREFIX}-${year}-${String(sequence).padStart(6, '0')}`;
}

/** Reserves the next appointment code for the municipal year of `now`. */
export async function allocateAppointmentReferenceCode(now: Date = new Date()): Promise<string> {
  const year = municipalYear(now);
  const sequence = await nextSequence(`appointment:${year}`);
  return formatAppointmentCode(year, sequence);
}
