/**
 * Local development harness — a real `mongod`, in memory.
 *
 * `mongodb-memory-server` fetches and runs an actual mongod binary on a
 * throwaway data directory, so the API under test uses the same driver, indexes
 * and aggregation pipeline as production. Nothing here ever reads or writes the
 * configured `MONGODB_URI`.
 *
 *   tsx src/dev-memory.ts server   boot mongod + the API on PORT (default 4000)
 *   tsx src/dev-memory.ts seed     load the sample reports, print a summary, exit
 *   tsx src/dev-memory.ts smoke    boot, assert the API end to end, exit non-zero on failure
 */
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mms from 'mongodb-memory-server';
import { createApp } from './app.js';
import { getDefaultRegistry } from './barangays.js';
import { loadConfig } from './config.js';
import { computeReportStats } from './lib/stats.js';
import { errorMessage, log, setLogLevel } from './logger.js';
import { SESSION_COOKIE } from './middleware/auth.js';
import { SEED_REPORTS } from './seed-data.js';
import { createReport, updateReport } from './services/report-service.js';
import { connectDatabase, disconnectDatabase } from './db.js';

const { MongoMemoryServer } = mms;

const DB_NAME = 'betterlabo';
const DEV_ADMIN_TOKEN = 'dev-admin-token';
const SMOKE_ADMIN_TOKEN = 'smoke-admin-token-0123456789';
const SMOKE_SESSION_SECRET = 'smoke-session-secret-0123456789';

/** A PSA PSGC code verified against apps/web/public/data/barangays.json (Anameam). */
const SMOKE_BARANGAY_PSGC = '0501606001';

const MODES = ['server', 'seed', 'smoke'] as const;
type Mode = (typeof MODES)[number];

interface Harness {
  uri: string;
  stopper(): Promise<void>;
}

async function startMongod(): Promise<Harness> {
  // A fresh data directory every run: a leftover lock file from a killed run
  // must never make the harness fail to boot.
  const dbPath = mkdtempSync(join(tmpdir(), 'betterlabo-mongod-'));
  const mongod = await MongoMemoryServer.create({ instance: { dbPath, dbName: DB_NAME } });
  const uri = mongod.getUri();
  await connectDatabase(uri, { dbName: DB_NAME });

  return {
    uri,
    stopper: async () => {
      await disconnectDatabase();
      await mongod.stop();
      try {
        rmSync(dbPath, { recursive: true, force: true });
      } catch {
        // Best effort — the OS will reap the temp directory.
      }
    },
  };
}

/* ───────────────────────────── dependencies for the smoke assertions ─────── */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Reads `a.b.0.c` out of an untyped JSON body, or `undefined`. */
function pick(source: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((accumulator, key) => {
    if (typeof accumulator !== 'object' || accumulator === null) return undefined;
    return (accumulator as Record<string, unknown>)[key];
  }, source);
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0;
}

function countOf(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : -1;
}

/* ───────────────────────────── mode: server ──────────────────────────────── */

async function runServer(): Promise<void> {
  const envToken = (process.env['ADMIN_TOKEN'] ?? '').trim();
  const config = loadConfig({
    turnstile: { mode: 'off', secretKey: '' },
    adminToken: envToken !== '' ? envToken : DEV_ADMIN_TOKEN,
  });
  setLogLevel(config.logLevel);

  const registry = getDefaultRegistry();
  const app = createApp({ config, registry });
  const server = app.listen(config.port);

  await once(server, 'listening');

  console.log('');
  console.log('  BetterLabo API — in-memory mongod (this database is discarded on exit)');
  console.log(`  → http://localhost:${config.port}/api/health`);
  console.log(`  → ${config.port === 4000 ? 'http://localhost:4000' : `http://localhost:${config.port}`}/api/reports`);
  console.log(`  admin bearer token: ${config.adminToken}`);
  console.log(
    `  barangay index: ${registry.size} barangay(s)${registry.source ? ` from ${registry.source}` : ' (none found)'}`,
  );
  console.log('  Ctrl+C to stop');
  console.log('');

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      server.close(() => resolve());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

/* ───────────────────────────── mode: seed ───────────────────────────────── */

async function runSeed(): Promise<number> {
  const registry = getDefaultRegistry();
  const byStatus = new Map<string, number>();

  for (const seed of SEED_REPORTS) {
    const doc = await createReport(seed, { registry, source: 'citizen' });

    if (seed.workflow) {
      await updateReport(String(doc._id), {
        status: seed.workflow.status,
        ...(seed.workflow.priority ? { priority: seed.workflow.priority } : {}),
        ...(seed.workflow.assignedOffice !== undefined
          ? { assignedOffice: seed.workflow.assignedOffice }
          : {}),
        ...(seed.workflow.resolutionNote !== undefined
          ? { resolutionNote: seed.workflow.resolutionNote }
          : {}),
      });
      const status = seed.workflow.status;
      byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
    } else {
      byStatus.set('received', (byStatus.get('received') ?? 0) + 1);
    }
  }

  const stats = await computeReportStats();
  console.log(`Seeded ${SEED_REPORTS.length} sample reports.`);
  for (const [status, count] of [...byStatus.entries()].sort()) {
    console.log(`  ${status.padEnd(12)} ${count}`);
  }
  console.log(
    `  stats: total=${stats.total} open=${stats.open} resolved=${stats.resolved} last30Days=${stats.last30Days}`,
  );
  return 0;
}

/* ───────────────────────────── mode: smoke ──────────────────────────────── */

interface ApiResponse {
  status: number;
  body: unknown;
  /** Raw `Set-Cookie` header, when the response carried one. */
  setCookie: string | null;
}

interface CallInit {
  body?: unknown;
  token?: string;
  /** Sent back as a `Cookie` header — how the console's session actually travels. */
  cookie?: string;
}

async function runSmoke(): Promise<number> {
  const config = loadConfig({
    nodeEnv: 'test',
    adminToken: SMOKE_ADMIN_TOKEN,
    adminSessionSecret: SMOKE_SESSION_SECRET,
    turnstile: { mode: 'off', secretKey: '' },
    rateLimit: { windowMs: 60_000, max: 5 },
    webhookUrl: null,
    corsOrigins: ['http://localhost:3000'],
    logLevel: 'error',
  });
  setLogLevel(config.logLevel);

  const registry = getDefaultRegistry();
  const app = createApp({ config, registry });
  const server = app.listen(0);
  await once(server, 'listening');
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;

  let passed = 0;
  const failures: string[] = [];

  const check = (name: string, ok: boolean, detail = ''): void => {
    if (ok) {
      passed += 1;
      console.log(`PASS ${name}`);
    } else {
      failures.push(name);
      console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
  };

  const call = async (method: string, path: string, init: CallInit = {}): Promise<ApiResponse> => {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (init.body !== undefined) headers['Content-Type'] = 'application/json';
    if (init.token !== undefined) headers['Authorization'] = `Bearer ${init.token}`;
    if (init.cookie !== undefined) headers['Cookie'] = init.cookie;

    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    const text = await response.text();
    let body: unknown = null;
    try {
      body = text === '' ? null : JSON.parse(text);
    } catch {
      body = text;
    }
    /**
     * The cookie has to be observable, because that is the console's real
     * transport. Without it this harness could only test the bearer path, which
     * is exactly how a sign-in that never worked shipped unnoticed.
     */
    const setCookie = response.headers.getSetCookie?.()[0] ?? null;
    return { status: response.status, body, setCookie };
  };

  const validReport = {
    category: 'flood_drainage',
    barangayPsgc: SMOKE_BARANGAY_PSGC,
    subject: 'Blocked canal beside the elementary school',
    details:
      'Runoff from the road has been standing in the canal beside the school since the last rain, and it no longer drains at all.',
    locationLabel: 'Canal beside Anameam Elementary School',
    location: { lat: 14.163929819750052, lng: 122.59342161825009 },
    reporterName: 'Smoke Tester',
    reporterContact: 'smoke@example.ph',
    contactConsent: true,
  };

  const canEnforceMembership = registry.size > 0;

  try {
    /* ── liveness and the empty database ─────────────────────────────────── */
    const health = await call('GET', '/api/health');
    check(
      'GET /api/health answers ok',
      health.status === 200 && pick(health.body, 'ok') === true,
      `status=${health.status}`,
    );
    check(
      'GET /api/health reports the database connected',
      pick(health.body, 'database') === 'connected',
      `database=${String(pick(health.body, 'database'))}`,
    );

    const emptyStats = await call('GET', '/api/reports/stats');
    check(
      'GET /api/reports/stats starts at zero',
      emptyStats.status === 200 && countOf(pick(emptyStats.body, 'total')) === 0,
      `total=${String(pick(emptyStats.body, 'total'))}`,
    );

    const missingRoute = await call('GET', '/api/does-not-exist');
    check(
      'an unknown route answers 404 not_found',
      missingRoute.status === 404 && pick(missingRoute.body, 'error.code') === 'not_found',
      `status=${missingRoute.status} code=${String(pick(missingRoute.body, 'error.code'))}`,
    );

    /* ── intake ──────────────────────────────────────────────────────────── */
    const created = await call('POST', '/api/reports', { body: validReport });
    const createdItem = pick(created.body, 'item');
    const createdId = String(pick(createdItem, 'id') ?? '');
    const referenceCode = String(pick(createdItem, 'referenceCode') ?? '');

    check(
      'POST /api/reports creates a report',
      created.status === 201 && createdId.length > 0,
      `status=${created.status} body=${JSON.stringify(created.body).slice(0, 200)}`,
    );
    check(
      'POST /api/reports returns a quotable reference code',
      /^LB-\d{4}-\d{6}$/.test(referenceCode),
      `referenceCode=${referenceCode}`,
    );
    check(
      'a new report starts received with normal priority',
      pick(createdItem, 'status') === 'received' && pick(createdItem, 'priority') === 'normal',
      `status=${String(pick(createdItem, 'status'))} priority=${String(pick(createdItem, 'priority'))}`,
    );
    check(
      'the barangay name is resolved from the PSGC code',
      isNonEmptyString(pick(createdItem, 'barangayName')),
      `barangayName=${String(pick(createdItem, 'barangayName'))}`,
    );
    check(
      'the category default office is assigned',
      isNonEmptyString(pick(createdItem, 'assignedOffice')),
      `assignedOffice=${String(pick(createdItem, 'assignedOffice'))}`,
    );
    check(
      'the submission records a citizen audit entry',
      pick(createdItem, 'history.0.actor') === 'citizen' &&
        pick(createdItem, 'history.0.action') === 'submitted',
      `history.0=${JSON.stringify(pick(createdItem, 'history.0'))}`,
    );
    check(
      'the public projection hides the reporter identity',
      !('reporterContact' in asRecord(createdItem)) && !('reporterName' in asRecord(createdItem)),
      `keys=${Object.keys(asRecord(createdItem)).join(',')}`,
    );

    /* ── validation ──────────────────────────────────────────────────────── */
    const shortDetails = await call('POST', '/api/reports', {
      body: { ...validReport, details: 'too short' },
    });
    check(
      'details below the minimum length are rejected',
      shortDetails.status === 400 && pick(shortDetails.body, 'error.code') === 'validation_failed',
      `status=${shortDetails.status} code=${String(pick(shortDetails.body, 'error.code'))}`,
    );
    check(
      'the rejection payload names the offending field',
      asArray(pick(shortDetails.body, 'error.details')).some(
        (issue) => pick(issue, 'path') === 'details',
      ),
      `details=${JSON.stringify(pick(shortDetails.body, 'error.details')).slice(0, 200)}`,
    );

    const honeypot = await call('POST', '/api/reports', {
      body: { ...validReport, website: 'http://spam.example' },
    });
    check(
      'a filled honeypot field is rejected',
      honeypot.status === 400,
      `status=${honeypot.status}`,
    );

    if (canEnforceMembership) {
      const outsideMunicipality = await call('POST', '/api/reports', {
        body: { ...validReport, barangayPsgc: '0599999999' },
      });
      check(
        'a PSGC code outside the municipality is rejected',
        outsideMunicipality.status === 400 &&
          pick(outsideMunicipality.body, 'error.code') === 'validation_failed',
        `status=${outsideMunicipality.status}`,
      );
    } else {
      console.log(
        'SKIP a PSGC code outside the municipality is rejected (no barangay index was found)',
      );
    }

    /* ── tracking ────────────────────────────────────────────────────────── */
    const lookup = await call(
      'GET',
      `/api/reports/lookup?referenceCode=${encodeURIComponent(referenceCode)}`,
    );
    check(
      'GET /api/reports/lookup finds the report by reference code',
      lookup.status === 200 && pick(lookup.body, 'item.id') === createdId,
      `status=${lookup.status}`,
    );
    check(
      'the lookup response also hides the reporter identity',
      !('reporterContact' in asRecord(pick(lookup.body, 'item'))),
      `keys=${Object.keys(asRecord(pick(lookup.body, 'item'))).join(',')}`,
    );

    const unknownLookup = await call('GET', '/api/reports/lookup?referenceCode=LB-1999-000001');
    check(
      'looking up an unknown reference code is 404 not_found',
      unknownLookup.status === 404 && pick(unknownLookup.body, 'error.code') === 'not_found',
      `status=${unknownLookup.status}`,
    );

    const malformedLookup = await call('GET', '/api/reports/lookup?referenceCode=nope');
    check(
      'a malformed reference code is 400 validation_failed',
      malformedLookup.status === 400 &&
        pick(malformedLookup.body, 'error.code') === 'validation_failed',
      `status=${malformedLookup.status}`,
    );

    /* ── console ─────────────────────────────────────────────────────────── */
    const anonymous = await call('GET', '/api/admin/reports');
    check(
      'the console rejects an anonymous request',
      anonymous.status === 401 && pick(anonymous.body, 'error.code') === 'unauthorized',
      `status=${anonymous.status}`,
    );

    const wrongToken = await call('GET', '/api/admin/reports', { token: 'not-the-admin-token' });
    check(
      'the console rejects a wrong bearer token',
      wrongToken.status === 401,
      `status=${wrongToken.status}`,
    );

    const session = await call('POST', '/api/admin/session', {
      body: { token: SMOKE_ADMIN_TOKEN },
    });
    const sessionToken = String(pick(session.body, 'item.token') ?? '');
    check(
      'POST /api/admin/session exchanges the admin token for a session',
      session.status === 201 && sessionToken.length > 0,
      `status=${session.status}`,
    );

    /*
     * The console's real transport is the session COOKIE, not the bearer token.
     * Assert the whole round trip — issue it, send it back, be recognised — because
     * bearer-only coverage is exactly how a sign-in that could never succeed
     * survived 34 green assertions.
     */
    const cookieValue = (session.setCookie ?? '').split(';')[0] ?? '';
    check(
      'POST /api/admin/session sets an httpOnly session cookie',
      cookieValue.startsWith(`${SESSION_COOKIE}=`) && /httponly/i.test(session.setCookie ?? ''),
      `set-cookie=${(session.setCookie ?? '(none)').slice(0, 90)}`,
    );

    const withCookie = await call('GET', '/api/admin/session', { cookie: cookieValue });
    check(
      'GET /api/admin/session reports authenticated for that cookie',
      withCookie.status === 200 && pick(withCookie.body, 'authenticated') === true,
      `status=${withCookie.status} body=${JSON.stringify(withCookie.body).slice(0, 120)}`,
    );

    const anonSession = await call('GET', '/api/admin/session');
    check(
      'GET /api/admin/session answers 200/false when anonymous',
      anonSession.status === 200 && pick(anonSession.body, 'authenticated') === false,
      `status=${anonSession.status} body=${JSON.stringify(anonSession.body).slice(0, 120)}`,
    );

    const cookieCanList = await call('GET', '/api/admin/reports', { cookie: cookieValue });
    check(
      'the session cookie authorises the console API',
      cookieCanList.status === 200,
      `status=${cookieCanList.status}`,
    );

    const signOut = await call('DELETE', '/api/admin/session', { cookie: cookieValue });
    check(
      'DELETE /api/admin/session clears the cookie',
      signOut.status === 200 && /max-age=0|expires=/i.test(signOut.setCookie ?? ''),
      `set-cookie=${(signOut.setCookie ?? '(none)').slice(0, 90)}`,
    );

    const sandbox = await call('GET', '/api/admin/reports', { token: sessionToken });
    check(
      'the console lists reports with the session token',
      sandbox.status === 200 && countOf(pick(sandbox.body, 'total')) >= 1,
      `status=${sandbox.status} total=${String(pick(sandbox.body, 'total'))}`,
    );
    check(
      'the console list contains the report just filed',
      asArray(pick(sandbox.body, 'items')).some((item) => pick(item, 'id') === createdId),
      `items=${asArray(pick(sandbox.body, 'items')).length}`,
    );

    const filtered = await call('GET', '/api/admin/reports?status=received&limit=5', {
      token: sessionToken,
    });
    const filteredItems = asArray(pick(filtered.body, 'items'));
    check(
      'the console list filters by status',
      filtered.status === 200 &&
        filteredItems.length >= 1 &&
        filteredItems.every((item) => pick(item, 'status') === 'received'),
      `status=${filtered.status} items=${filteredItems.length}`,
    );

    const patched = await call('PATCH', `/api/admin/reports/${createdId}`, {
      token: sessionToken,
      body: {
        status: 'in_progress',
        priority: 'high',
        resolutionNote: 'Canal desilting scheduled for next week.',
      },
    });
    check(
      'PATCH updates status and priority',
      patched.status === 200 &&
        pick(patched.body, 'item.status') === 'in_progress' &&
        pick(patched.body, 'item.priority') === 'high',
      `status=${patched.status} issue=${JSON.stringify(patched.body).slice(0, 200)}`,
    );
    check(
      'PATCH appends a console entry to the audit trail',
      asArray(pick(patched.body, 'item.history')).length === 3 &&
        pick(patched.body, 'item.history.2.actor') === 'console',
      `history=${asArray(pick(patched.body, 'item.history')).length}`,
    );

    const badPatch = await call('PATCH', `/api/admin/reports/${createdId}`, {
      token: sessionToken,
      body: { status: 'nonsense' },
    });
    check(
      'PATCH with an unknown status is rejected',
      badPatch.status === 400 && pick(badPatch.body, 'error.code') === 'validation_failed',
      `status=${badPatch.status}`,
    );

    const fetched = await call('GET', `/api/admin/reports/${createdId}`, { token: sessionToken });
    check(
      'GET /api/admin/reports/:id returns the full record with contact details',
      fetched.status === 200 && pick(fetched.body, 'item.reporterContact') === 'smoke@example.ph',
      `status=${fetched.status} reporterContact=${String(pick(fetched.body, 'item.reporterContact'))}`,
    );

    const adminStats = await call('GET', '/api/admin/stats', { token: sessionToken });
    check(
      'GET /api/admin/stats aggregates the reports',
      adminStats.status === 200 && countOf(pick(adminStats.body, 'total')) >= 1,
      `status=${adminStats.status} total=${String(pick(adminStats.body, 'total'))}`,
    );

    const publicStats = await call('GET', '/api/reports/stats');
    check(
      'public stats count the report under its new status',
      publicStats.status === 200 &&
        countOf(pick(publicStats.body, 'total')) >= 1 &&
        asArray(pick(publicStats.body, 'byStatus')).some((entry) => pick(entry, 'status') === 'in_progress'),
      `status=${publicStats.status} byStatus=${JSON.stringify(pick(publicStats.body, 'byStatus'))}`,
    );

    /* ── abuse protection ────────────────────────────────────────────────── */
    let rateLimitedCode = '';
    for (let attempt = 0; attempt < 8 && rateLimitedCode === ''; attempt += 1) {
      const throttled = await call('POST', '/api/reports', {
        body: { ...validReport, details: 'too short to be accepted' },
      });
      if (throttled.status === 429) rateLimitedCode = String(pick(throttled.body, 'error.code'));
    }
    check(
      'POST /api/reports is rate limited after REPORT_RATE_LIMIT_MAX',
      rateLimitedCode === 'rate_limited',
      `code=${rateLimitedCode || '(no 429 seen)'}`,
    );

    /* ── removal ─────────────────────────────────────────────────────────── */
    const removed = await call('DELETE', `/api/admin/reports/${createdId}`, {
      token: sessionToken,
    });
    check(
      'DELETE removes the report',
      removed.status === 200 && pick(removed.body, 'ok') === true,
      `status=${removed.status}`,
    );

    const afterDelete = await call('GET', `/api/admin/reports/${createdId}`, {
      token: sessionToken,
    });
    check('the deleted report is gone', afterDelete.status === 404, `status=${afterDelete.status}`);
  } catch (err) {
    failures.push('the smoke run threw');
    console.error(`FAIL the smoke run threw — ${errorMessage(err)}`);
    if (err instanceof Error && err.stack) console.error(err.stack);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  console.log('');
  if (failures.length > 0) {
    console.error(`${passed} passed, ${failures.length} failed`);
    console.error(`SMOKE FAILED: ${failures.join(' | ')}`);
    return 1;
  }
  console.log(`${passed} passed, 0 failed`);
  return 0;
}

/* ───────────────────────────── entry point ──────────────────────────────── */

async function main(): Promise<void> {
  const requested = process.argv[2] ?? 'server';
  if (!MODES.includes(requested as Mode)) {
    console.error(`Unknown mode "${requested}". Expected one of: ${MODES.join(', ')}.`);
    process.exitCode = 2;
    return;
  }
  const mode = requested as Mode;

  if (mode !== 'server') setLogLevel('error');

  const harness = await startMongod();
  log.debug('in-memory mongod ready', { uri: harness.uri, mode });

  try {
    if (mode === 'server') {
      await runServer();
      return;
    }
    if (mode === 'seed') {
      process.exitCode = await runSeed();
      return;
    }
    process.exitCode = await runSmoke();
  } finally {
    await harness.stopper();
  }
}

void main().catch((err: unknown) => {
  console.error(`dev-memory harness failed: ${errorMessage(err)}`);
  if (err instanceof Error && err.stack) console.error(err.stack);
  process.exitCode = 1;
});
