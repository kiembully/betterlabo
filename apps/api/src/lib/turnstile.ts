/**
 * Cloudflare Turnstile verification.
 *
 * `off` mode is the default and keeps local development working with no external
 * account; `enforce` mode fails closed — a missing token, a non-2xx answer or an
 * unreachable Cloudflare all reject the submission, because the alternative is
 * silently accepting bot traffic on a form the LGU reads.
 */
import { errorMessage, log } from '../logger.js';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 8_000;

export interface TurnstileRequest {
  token: string | null;
  remoteIp?: string | null;
  mode: 'off' | 'enforce';
  secretKey: string;
}

export interface TurnstileResult {
  ok: boolean;
  /** True when the check was skipped because the mode is `off`. */
  skipped: boolean;
  reason?: string;
}

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstile(input: TurnstileRequest): Promise<TurnstileResult> {
  if (input.mode !== 'enforce') {
    return { ok: true, skipped: true };
  }
  if (input.secretKey === '') {
    return { ok: false, skipped: false, reason: 'The anti-spam check is not configured.' };
  }
  if (!input.token) {
    return { ok: false, skipped: false, reason: 'The anti-spam check did not return a token.' };
  }

  const form = new URLSearchParams();
  form.set('secret', input.secretKey);
  form.set('response', input.token);
  if (input.remoteIp) form.set('remoteip', input.remoteIp);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      log.warn('turnstile siteverify returned a non-2xx status', { status: response.status });
      return { ok: false, skipped: false, reason: 'The anti-spam check could not be completed.' };
    }
    const data = (await response.json()) as SiteverifyResponse;
    if (data.success === true) return { ok: true, skipped: false };
    const codes = data['error-codes'] ?? [];
    log.warn('turnstile rejected a token', { codes });
    return {
      ok: false,
      skipped: false,
      reason: codes.length > 0 ? `The anti-spam check failed (${codes.join(', ')}).` : 'The anti-spam check failed.',
    };
  } catch (err) {
    log.warn('turnstile siteverify could not be reached', { error: errorMessage(err) });
    return { ok: false, skipped: false, reason: 'The anti-spam check could not be reached.' };
  }
}
