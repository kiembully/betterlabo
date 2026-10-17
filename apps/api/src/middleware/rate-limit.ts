/**
 * Per-IP rate limit for the public intake endpoints.
 *
 * Scoped to the two POST routes only: reading stats and looking up a reference
 * code are free, and a municipal network behind one NAT must not be able to
 * exhaust anyone else's allowance for those. The window and ceiling come from
 * `REPORT_RATE_LIMIT_WINDOW_MS` / `REPORT_RATE_LIMIT_MAX`.
 *
 * Each endpoint gets its own limiter instance, and therefore its own store: a
 * burst of report submissions must not consume the appointment allowance a
 * resident is about to use.
 */
import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { failureBody } from '../http.js';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

function createIntakeRateLimiter(options: RateLimitOptions, subject: string): RequestHandler {
  const minutes = Math.max(1, Math.round(options.windowMs / 60_000));
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res
        .status(429)
        .json(
          failureBody(
            'rate_limited',
            `Too many ${subject} have been sent from this connection. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
          ),
        );
    },
  });
}

export function createReportRateLimiter(options: RateLimitOptions): RequestHandler {
  return createIntakeRateLimiter(options, 'reports');
}

export function createAppointmentRateLimiter(options: RateLimitOptions): RequestHandler {
  return createIntakeRateLimiter(options, 'appointment requests');
}
