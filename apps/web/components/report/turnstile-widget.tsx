'use client';

import { useEffect, useRef } from 'react';

/**
 * Cloudflare Turnstile, rendered explicitly so the form owns the token.
 *
 * The whole widget is inert when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is empty (a
 * local clone with no Cloudflare account): the script is never requested, no
 * global is touched and the form submits with `turnstileToken: null`, which the
 * API accepts while `TURNSTILE_MODE` is `off`.
 */

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

interface TurnstileApi {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);

  // Keep the callback fresh without letting a parent re-render tear down the widget.
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey) {
      onTokenRef.current(null);
      return;
    }

    let cancelled = false;
    let poll: number | undefined;

    const mount = () => {
      const api = window.turnstile;
      if (cancelled || !api || !containerRef.current || widgetIdRef.current) return;
      widgetIdRef.current = api.render(containerRef.current, {
        sitekey: siteKey,
        theme: 'light',
        callback: (token: string) => onTokenRef.current(token),
        'expired-callback': () => onTokenRef.current(null),
        'error-callback': () => onTokenRef.current(null),
      });
    };

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    if (window.turnstile) mount();
    else poll = window.setInterval(mount, 200);

    return () => {
      cancelled = true;
      if (poll !== undefined) window.clearInterval(poll);
      const id = widgetIdRef.current;
      widgetIdRef.current = null;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          /* the widget is already gone — nothing to clean up */
        }
      }
    };
  }, [siteKey]);

  if (!siteKey) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">Verification</span>
      <div ref={containerRef} className="min-h-[65px]" />
      <p className="text-xs leading-relaxed text-ink-subtle">
        A Cloudflare check runs before the report leaves your browser. It is used only to block
        automated spam.
      </p>
    </div>
  );
}
