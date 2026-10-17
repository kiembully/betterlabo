/**
 * `/api/*` bridge — see docs/architecture.md ("One deployment").
 *
 * The reporting API is a real Express 5 + Mongoose 9 app, but it is not exposed
 * on its own origin. This catch-all boots it ONCE per server process on a loopback
 * port and proxies to it, which means:
 *   - one deployment instead of two,
 *   - no CORS, and the console's session cookie stays first-party (Safari and
 *     Firefox block cross-site cookies, which would break admin sign-in),
 *   - the public portal keeps working when the API is unavailable.
 *
 * Two things this route must get right:
 *  1. The catch-all param DROPS the mount prefix — `/api/health` arrives as
 *     `["health"]` — so the target URL is rebuilt as `${base}/api/${path}`.
 *  2. The public pages must never be affected by a broken API. If the workspace
 *     cannot be imported (not built, missing driver), the route answers a clean
 *     503 with the documented error envelope instead of throwing.
 */
import type { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Booted = { baseUrl: string } | { error: string };

let bootPromise: Promise<Booted> | null = null;

async function bootApi(): Promise<Booted> {
  const external = process.env.API_INTERNAL_URL?.trim();
  if (external) return { baseUrl: external.replace(/\/+$/, '') };

  let api: typeof import('@betterlabo/api');
  try {
    // Imported lazily so a missing or unbuilt API workspace degrades at request
    // time rather than failing `next build`.
    api = await import('@betterlabo/api');
  } catch (err) {
    return {
      error: `@betterlabo/api could not be imported (${err instanceof Error ? err.message : String(err)}). Run \`npm run build:api\`.`,
    };
  }

  try {
    /**
     * `trustProxy: true` is correct for this arrangement and nothing else needs
     * it: in the mounted setup the Next server IS the proxy, so it is what sets
     * `X-Forwarded-For`. Without it, `express-rate-limit` refuses to key on the
     * client address and logs ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every
     * submission (the limiter then cannot tell two citizens apart).
     */
    const config = api.loadConfig({ trustProxy: true });

    /**
     * `createApp` must run only after the database connection has settled: a
     * fire-and-forget `connectDatabase` renders pages fine while every `/api/*`
     * request races the connection with `MongoNotConnectedError`.
     *
     * No MONGODB_URI is a supported state, not a failure — the API boots,
     * `/api/health` reports `db: "unavailable"`, and report submission answers a
     * clean 503. So a connection error is logged and the app still boots.
     */
    if (config.mongodbUri) {
      try {
        await api.connectDatabase(config.mongodbUri, {
          dbName: config.mongodbDb,
          serverSelectionTimeoutMS: 8000,
        });
      } catch (err) {
        console.error(
          '[api-bridge] database connection failed; reporting endpoints will answer db_unavailable:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    const app = api.createApp({ config });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    server.unref();

    const address = server.address();
    if (!address || typeof address === 'string') {
      return { error: 'the API did not report a loopback port' };
    }
    return { baseUrl: `http://127.0.0.1:${address.port}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

async function apiBase(): Promise<Booted> {
  bootPromise ??= bootApi();
  const result = await bootPromise;
  // Let the next request retry rather than caching a boot failure forever.
  if ('error' in result) bootPromise = null;
  return result;
}

function unavailable(reason: string): Response {
  return Response.json(
    {
      error: {
        code: 'db_unavailable',
        message:
          'The reporting service is not available in this deployment. The rest of the portal is unaffected.',
        ...(process.env.NODE_ENV === 'production' ? {} : { details: reason }),
      },
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}

async function proxy(request: NextRequest, context: { params: Promise<{ path?: string[] }> }) {
  const booted = await apiBase();
  if ('error' in booted) return unavailable(booted.error);

  const { path } = await context.params;
  const suffix = (path ?? []).join('/');
  const target = `${booted.baseUrl}/api/${suffix}${request.nextUrl.search}`;

  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const hasBody = !['GET', 'HEAD'].includes(request.method);

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      redirect: 'manual',
      cache: 'no-store',
    });
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }

  const outHeaders = new Headers(upstream.headers);
  /**
   * Forward `Set-Cookie` explicitly.
   *
   * `Set-Cookie` is special in the Fetch API — a "forbidden response-header
   * name" that implementations may filter out of a `Headers` copy, and which
   * `get()` returns null for. The console's whole session lives in that cookie,
   * so relying on the copy alone would break sign-in on any runtime that filters
   * it. `getSetCookie()` returns them unjoined, which is the only form that
   * survives multiple cookies.
   */
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    outHeaders.delete('set-cookie');
    for (const cookie of setCookies) outHeaders.append('set-cookie', cookie);
  }
  // A proxied response must not be cached as if it were static data.
  outHeaders.set('Cache-Control', 'no-store');
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
