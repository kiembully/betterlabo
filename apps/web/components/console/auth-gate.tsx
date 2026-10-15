'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, RefreshCw } from 'lucide-react';

import { ApiError, apiGet, apiPost, describeError } from '@/lib/api';

import { ConsoleShell } from './console-shell';
import { ConsoleErrorNotice, ConsoleUnreachableNotice } from './notices';
import { signOut, type AdminSession } from './session';

type GateState = 'checking' | 'anon' | 'authed' | 'unreachable';

/**
 * Cookie-based console auth.
 *
 * The session cookie is httpOnly, so the browser cannot read it; the only way to
 * know whether an operator is signed in is to ask the API. `GET
 * /api/admin/session` is that question, and it is re-asked after a login so the
 * UI never claims a session the server did not issue.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    setError(null);
    try {
      const res = await apiGet<AdminSession>('/api/admin/session');
      setState(res.authenticated ? 'authed' : 'anon');
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setState('anon');
        return;
      }
      setState('unreachable');
      setError(describeError(err));
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = token.trim();
    if (!value) {
      setError('Enter the console token.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await apiPost<{ ok: true }>('/api/admin/session', { token: value });
      setToken('');
      await check();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'unauthorized'
          ? 'That token was not accepted. Check ADMIN_TOKEN and try again.'
          : describeError(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      /* the cookie may already be gone — the session check below is the truth */
    }
    await check();
  }

  if (state === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface-sunken p-6">
        <p className="flex items-center gap-3 text-sm font-semibold text-ink-support">
          <Loader2 aria-hidden className="size-5 animate-spin text-brand-700" />
          Checking your console session…
        </p>
      </div>
    );
  }

  if (state === 'unreachable') {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface-sunken p-6">
        <div className="w-full max-w-xl">
          <ConsoleUnreachableNotice message={error ?? 'No response from the API.'} />
          <button
            type="button"
            onClick={() => {
              setState('checking');
              void check();
            }}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-rule-strong bg-surface px-4 text-sm font-semibold text-ink"
          >
            <RefreshCw aria-hidden className="size-4" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (state === 'anon') {
    return (
      <div className="grid min-h-dvh place-items-center bg-surface-sunken p-6">
        <div className="w-full max-w-md">
          <div className="card p-6 sm:p-7">
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-lg bg-brand-900 font-mono text-sm font-bold text-brand-50"
            >
              BL
            </span>
            <h1 className="mt-4 text-xl font-bold text-ink">BetterLabo console</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-support">
              Restricted to municipal staff. Sign in with the operator token configured on the
              server as <span className="figure-num">ADMIN_TOKEN</span>.
            </p>

            {error ? <ConsoleErrorNotice message={error} title="Sign-in failed" /> : null}

            <form noValidate onSubmit={handleLogin} className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="console-token" className="text-sm font-semibold text-ink">
                  Operator token
                </label>
                <input
                  id="console-token"
                  name="token"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full min-w-0 rounded-lg border border-rule-strong bg-surface px-3.5 py-3 text-base text-ink transition-colors focus:border-brand-600"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-900 px-5 text-base font-semibold text-brand-50 transition-colors hover:bg-brand-800 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 aria-hidden className="size-5 animate-spin" />
                ) : (
                  <KeyRound aria-hidden className="size-5" />
                )}
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
          <p className="mt-4 text-center text-xs leading-relaxed text-ink-subtle">
            The token is exchanged for a short-lived httpOnly session cookie. It is never stored in
            the browser.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ConsoleShell onSignOut={handleSignOut}>
      {children}
    </ConsoleShell>
  );
}
