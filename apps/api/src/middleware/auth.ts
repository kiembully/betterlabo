/**
 * Console authentication.
 *
 * Two accepted credentials:
 *
 *  - `ADMIN_TOKEN`, compared in constant time — for scripts and CI. Sent as
 *    `Authorization: Bearer` and never stored in a browser.
 *  - a short-lived session token minted by `POST /api/admin/session` from the
 *    admin token and signed with `ADMIN_SESSION_SECRET` via HMAC-SHA256.
 *
 * The session travels in an **httpOnly cookie**, and also works as a bearer
 * token. This mattered: the API originally accepted only `Authorization`, while
 * the console discarded the token the exchange returned and relied on a cookie
 * that nothing ever set — so signing in could never succeed, in any environment,
 * and no test noticed because the smoke suite always passed an explicit bearer.
 * Scripts keep using the bearer form; the browser uses the cookie, which
 * JavaScript cannot read.
 *
 * With no `ADMIN_TOKEN` configured the whole console is closed (403) rather than
 * open — a deployment that forgot the variable must fail shut.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import type { AppConfig } from '../config.js';
import { fail } from '../errors.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Name of the httpOnly console-session cookie. */
export const SESSION_COOKIE = 'betterlabo_admin';

function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Length-independent comparison, so token length is not a timing oracle. */
export function constantTimeEquals(a: string, b: string): boolean {
  return timingSafeEqual(sha256(a), sha256(b));
}

export function adminTokenMatches(expected: string, candidate: string): boolean {
  if (expected === '' || candidate === '') return false;
  return constantTimeEquals(expected, candidate);
}

export interface AdminSession {
  token: string;
  expiresAt: string;
}

export function issueAdminSession(config: AppConfig, now: number = Date.now()): AdminSession {
  if (config.adminSessionSecret === '') {
    throw fail.forbidden(
      'Session tokens are disabled on this deployment: ADMIN_SESSION_SECRET is not set. Send ADMIN_TOKEN directly.',
    );
  }
  const expiresAt = now + SESSION_TTL_MS;
  const payload = String(expiresAt);
  const signature = createHmac('sha256', config.adminSessionSecret)
    .update(`admin:${payload}`)
    .digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: new Date(expiresAt).toISOString() };
}

export function verifyAdminSession(
  config: AppConfig,
  token: string,
  now: number = Date.now(),
): boolean {
  if (config.adminSessionSecret === '') return false;
  const separator = token.indexOf('.');
  if (separator <= 0) return false;
  const payload = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiresAt = Number.parseInt(payload, 10);
  if (!Number.isInteger(expiresAt) || expiresAt <= now) return false;
  const expected = createHmac('sha256', config.adminSessionSecret)
    .update(`admin:${payload}`)
    .digest('base64url');
  return constantTimeEquals(signature, expected);
}

/** The bearer value on the request, or `''`. */
export function bearerToken(req: Request): string {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? '';
}

/**
 * The session cookie's value, or `''`.
 *
 * Parsed by hand rather than with `cookie-parser`: this is the only cookie the
 * API has, and the middleware would be a dependency for one split.
 */
export function sessionCookie(req: Request): string {
  const header = req.get('cookie') ?? '';
  if (header === '') return '';
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return '';
}

/**
 * The credential a request carries: an `Authorization` bearer if present,
 * otherwise the session cookie. Bearer wins so a script can override a browser
 * session on the same connection.
 */
export function requestCredential(req: Request): string {
  const bearer = bearerToken(req);
  return bearer !== '' ? bearer : sessionCookie(req);
}

/** True when the request arrived over TLS, so the cookie can be marked `Secure`. */
function isSecureRequest(req: Request): boolean {
  const forwarded = (req.get('x-forwarded-proto') ?? '').split(',')[0]?.trim().toLowerCase();
  return forwarded === 'https' || req.secure === true;
}

/** Issues the httpOnly session cookie for a freshly minted session. */
export function setSessionCookie(req: Request, res: Response, session: AdminSession): void {
  const maxAge = Math.max(0, Date.parse(session.expiresAt) - Date.now());
  res.cookie(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
    maxAge,
  });
}

/** Clears the session cookie, on sign-out or when a session turns out to be dead. */
export function clearSessionCookie(req: Request, res: Response): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(req),
    path: '/',
  });
}

/** True when the request carries a valid admin token or admin session. */
export function isAdminRequest(config: AppConfig, req: Request): boolean {
  const token = requestCredential(req);
  if (token === '') return false;
  if (adminTokenMatches(config.adminToken, token)) return true;
  return verifyAdminSession(config, token);
}

export function requireAdmin(config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    if (config.adminToken === '') {
      next(fail.forbidden('The admin console is not configured on this deployment.'));
      return;
    }
    const token = requestCredential(req);
    if (token === '') {
      next(fail.unauthorized('Provide an admin bearer token.'));
      return;
    }
    if (!isAdminRequest(config, req)) {
      next(fail.unauthorized('That admin credential is not valid.'));
      return;
    }
    next();
  };
}
