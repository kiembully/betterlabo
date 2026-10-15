/**
 * Browser-side access to the intake API.
 *
 * In the single-project deployment the Next server mounts the Express app and
 * every `/api/*` request is same-origin, so this module always talks to a
 * relative `/api` path. `NEXT_PUBLIC_API_URL` exists for the split deployment and
 * for local development where the API runs on its own port.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export interface ApiFailure {
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new ApiError(res.status, 'internal', 'The server returned a response that is not JSON.');
  }
  if (!res.ok) {
    const failure = body as ApiFailure | null;
    throw new ApiError(
      res.status,
      failure?.error?.code ?? 'internal',
      failure?.error?.message ?? `Request failed with status ${res.status}`,
      failure?.error?.details,
    );
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  });
  return parse<T>(res);
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  return parse<T>(res);
}

/** Turns any thrown value into a sentence a resident can act on. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    switch (err.code) {
      case 'db_unavailable':
        return 'The reporting database is not reachable right now. Your report was not saved — please try again later, or contact the municipal hall directly.';
      case 'rate_limited':
        return 'Too many reports have been submitted from this connection. Please wait a few minutes and try again.';
      case 'captcha_failed':
        return 'The anti-spam check did not pass. Please reload the page and try again.';
      case 'validation_failed':
        return err.message || 'Some fields need attention.';
      default:
        return err.message;
    }
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}
