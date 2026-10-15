/**
 * Typed request failures.
 *
 * Every route throws one of these and the error middleware turns it into the
 * shared `ApiError` envelope, so the wire contract lives in exactly one place.
 */
import type { ApiErrorCode } from '@betterlabo/shared';

export class AppError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(status: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Factories rather than static methods, so call sites read as sentences
 * (`throw fail.notFound('…')`) and the HTTP mapping stays in one table.
 */
export const fail = {
  badRequest: (message: string, details?: unknown): AppError =>
    new AppError(400, 'bad_request', message, details),
  validationFailed: (message: string, details?: unknown): AppError =>
    new AppError(400, 'validation_failed', message, details),
  captchaFailed: (message: string): AppError => new AppError(400, 'captcha_failed', message),
  unauthorized: (message = 'Authentication is required.'): AppError =>
    new AppError(401, 'unauthorized', message),
  forbidden: (message = 'You do not have access to this resource.'): AppError =>
    new AppError(403, 'forbidden', message),
  notFound: (message = 'Not found.'): AppError => new AppError(404, 'not_found', message),
  conflict: (message: string): AppError => new AppError(409, 'conflict', message),
  rateLimited: (message: string): AppError => new AppError(429, 'rate_limited', message),
  dbUnavailable: (
    message = 'The reporting database is not reachable right now. Nothing was saved.',
  ): AppError => new AppError(503, 'db_unavailable', message),
  internal: (message = 'Something went wrong on the server.'): AppError =>
    new AppError(500, 'internal', message),
} as const;

/** True for MongoDB's duplicate-key error, whatever layer surfaced it. */
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;
}
