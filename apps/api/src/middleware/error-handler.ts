/**
 * The single place an error becomes an HTTP response.
 *
 * Everything a route throws — an `AppError`, a zod issue, a Mongoose cast
 * failure, a body-parser syntax error — is mapped to the shared `ApiError`
 * envelope with an `API_ERROR_CODES` code, so the browser can switch on `code`
 * instead of matching prose.
 */
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorCode } from '@betterlabo/shared';
import { AppError, isDuplicateKeyError } from '../errors.js';
import { failureBody } from '../http.js';
import { errorMessage, log } from '../logger.js';
import { zodIssues } from '../lib/validation.js';

interface MappedError {
  status: number;
  code: ApiErrorCode;
  message: string;
  details?: unknown;
}

function httpishStatus(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null) return undefined;
  const candidate = err as { status?: unknown; statusCode?: unknown };
  const raw = typeof candidate.status === 'number' ? candidate.status : candidate.statusCode;
  if (typeof raw === 'number' && raw >= 400 && raw < 500) return raw;
  return undefined;
}

export function mapError(err: unknown): MappedError {
  if (err instanceof AppError) {
    return { status: err.status, code: err.code, message: err.message, details: err.details };
  }

  if (err instanceof ZodError) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'The request is not valid.',
      details: zodIssues(err),
    };
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return {
      status: 400,
      code: 'validation_failed',
      message: 'The record is not valid.',
      details: Object.values(err.errors).map((issue) => issue.message),
    };
  }

  if (err instanceof mongoose.Error.CastError) {
    return {
      status: 400,
      code: 'bad_request',
      message: `"${String(err.value)}" is not a valid ${err.path}.`,
    };
  }

  if (isDuplicateKeyError(err)) {
    return { status: 409, code: 'conflict', message: 'That record already exists.' };
  }

  if (err instanceof SyntaxError && (err as { type?: unknown }).type === 'entity.parse.failed') {
    return { status: 400, code: 'bad_request', message: 'The request body is not valid JSON.' };
  }

  const status = httpishStatus(err);
  if (status !== undefined) {
    return { status, code: 'bad_request', message: errorMessage(err) };
  }

  return { status: 500, code: 'internal', message: 'Something went wrong on the server.' };
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res
    .status(404)
    .json(failureBody('not_found', `No route matches ${req.method} ${req.path}.`));
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  const mapped = mapError(err);
  if (err instanceof AppError) {
    // A mapped failure is a decision, not a crash — 5xx here is the database
    // being down, which is expected and already reported to the caller.
    log[mapped.status >= 500 ? 'warn' : 'debug']('request rejected', {
      code: mapped.code,
      status: mapped.status,
      message: mapped.message,
    });
  } else {
    log.error('unhandled request error', { error: errorMessage(err) });
    if (err instanceof Error && err.stack) log.debug('error stack', { stack: err.stack });
  }
  res.status(mapped.status).json(failureBody(mapped.code, mapped.message, mapped.details));
};
