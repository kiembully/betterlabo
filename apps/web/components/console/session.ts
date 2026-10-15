import { API_BASE, ApiError, type ApiFailure } from '@/lib/api';

/**
 * `DELETE /api/admin/session` is the one console call that `@/lib/api` does not
 * already wrap (there is no `apiDelete`), so it lives here rather than being
 * hand-rolled inside a component. Envelope handling is deliberately identical
 * to `lib/api` so a failure is still an `ApiError` with a code.
 */
export async function signOut(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/session`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
  });

  if (res.ok) return;

  let code = 'internal';
  let message = `Sign-out failed with status ${res.status}`;
  try {
    const body = (await res.json()) as ApiFailure;
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
  } catch {
    /* non-JSON body — the status message stands */
  }
  throw new ApiError(res.status, code, message);
}

export interface AdminSession {
  ok: true;
  authenticated: boolean;
}
