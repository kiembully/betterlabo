/**
 * Per-IP rate limit for the public reporting endpoint.
 *
 * Scoped to `POST /api/reports` only: reading stats and looking up a reference
 * code are free, and a municipal network behind one NAT must not be able to
 * exhaust anyone else's allowance for those. The window and ceiling come from
 * `REPORT_RATE_LIMIT_WINDOW_MS` / `REPORT_RATE_LIMIT_MAX`.
 */
import { rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';
import { failureBody } from '../http.js';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export function createReportRateLimiter(options: RateLimitOptions): RequestHandler {
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
            `Too many reports have been sent from this connection. Please wait about ${minutes} minute${minutes === 1 ? '' : 's'} and try again.`,
          ),
        );
    },
  });
}
