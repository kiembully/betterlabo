/**
 * Console authentication.
 *
 * Two accepted credentials, both bearer tokens on `Authorization`:
 *
 *  - `ADMIN_TOKEN`, compared in constant time — for scripts and CI.
 *  - a short-lived session token minted by `POST /api/admin/session` from the
 *    admin token and signed with `ADMIN_SESSION_SECRET` via HMAC-SHA256, so the
 *    long-lived token itself does not have to sit in browser storage.
 *
 * With no `ADMIN_TOKEN` configured the whole console is closed (403) rather than
 * open — a deployment that forgot the variable must fail shut.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { AppConfig } from '../config.js';
import { fail } from '../errors.js';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

/** True when the request carries a valid admin token or admin session. */
export function isAdminRequest(config: AppConfig, req: Request): boolean {
  const token = bearerToken(req);
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
    const token = bearerToken(req);
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
