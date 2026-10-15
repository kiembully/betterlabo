/** Response envelope helpers — the only place that shapes a success body. */
import type { Response } from 'express';
import type { ApiError, ApiErrorCode, ItemEnvelope, ListEnvelope, OkEnvelope } from '@betterlabo/shared';

export function sendItem<T>(res: Response, item: T, status = 200): void {
  const body: ItemEnvelope<T> = { item };
  res.status(status).json(body);
}

export function sendList<T>(
  res: Response,
  items: T[],
  total: number,
  limit: number,
  offset: number,
): void {
  const body: ListEnvelope<T> = { items, total, limit, offset };
  res.status(200).json(body);
}

export function sendOk(res: Response, status = 200): void {
  const body: OkEnvelope = { ok: true };
  res.status(status).json(body);
}

export function failureBody(code: ApiErrorCode, message: string, details?: unknown): ApiError {
  return details === undefined
    ? { error: { code, message } }
    : { error: { code, message, details } };
}
