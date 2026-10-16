/**
 * Live check — `npm run check:live`.
 *
 * Boots the PRODUCTION build (`next start`) on a private port, fetches every real
 * route, and asserts values that only the compiled data can produce: Labo's actual
 * National Tax Allotment, the computed dependency ratio, a real barangay's PSGC
 * code and land area, the provenance registry. It then exercises the `/api/*`
 * bridge end to end.
 *
 * This exists because a green `next build` with an empty page is a real failure
 * mode, and because a stale server answering for a build that no longer exists on
 * disk produces convincing false results. The server is spawned as a child here so
 * shutting it down is exact — do not convert this to a bash harness, where
 * `printf body | grep -q` under `pipefail` reports failure on a MATCH (grep exits
 * early, the writer takes SIGPIPE) and `netstat`-parsed pids are easy to miss.
 *
 * Requires `npm run build` to have run first, and no database: the API must answer
 * a clean 503 for report submission, which is the documented behaviour of a
 * deployment without `MONGODB_URI`.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] ?? 3110);
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0;
let fail = 0;

function check(label, condition, detail = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS ${label}`);
  } else {
    fail += 1;
    console.log(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Drop the throwaway database this check wrote into, so a run leaves nothing
 * behind. Skipped entirely when no `MONGODB_URI` is configured — in that case the
 * POST never persisted anything.
 */
async function dropCheckDb() {
  try {
    process.loadEnvFile(join(repoRoot, '.env.local'));
  } catch {
    return;
  }
  const uri = process.env['MONGODB_URI'] ?? '';
  if (!uri) return;
  try {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    await client.db(CHECK_DB).dropDatabase();
    await client.close();
    console.log(`dropped the throwaway database '${CHECK_DB}'`);
  } catch (err) {
    console.log(`(could not drop '${CHECK_DB}': ${err.message})`);
  }
}

/**
 * Spawn the Next binary directly rather than through `npx …` with `shell: true`.
 * A shell wrapper means `child.kill()` kills the WRAPPER, the real server keeps
 * the port, and the next run then either fails to bind or — worse — asserts
 * against a server built from code that no longer exists on disk. Spawning node
 * itself makes the kill exact.
 *
 * `MONGODB_DB` is overridden so this check can never write into the real
 * database. It POSTs a report as part of exercising the intake path, and once a
 * `MONGODB_URI` is configured that write would otherwise land in production data.
 * A preset env var wins over `.env.local` (verified), so the override holds.
 */
const CHECK_DB = process.env['LIVECHECK_DB'] ?? 'betterlabo_livecheck';
const child = spawn(
  process.execPath,
  [join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)],
  {
    cwd: join(repoRoot, 'apps', 'web'),
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MONGODB_DB: CHECK_DB },
  },
);
let serverLog = '';
child.stdout.on('data', (d) => {
  serverLog += d.toString();
});
child.stderr.on('data', (d) => {
  serverLog += d.toString();
});

function shutdown(code) {
  try {
    child.kill('SIGKILL');
  } catch {
    /* already gone */
  }
  process.exit(code);
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/`, { signal: AbortSignal.timeout(5000) });
      if (res.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(15_000) });
  return { status: res.status, body: await res.text() };
}

if (!(await waitForServer())) {
  console.log('FAIL the server never became ready');
  console.log(serverLog.slice(-2000));
  shutdown(1);
}

/** [path, needle, label] — every needle is a value produced by the ETL. */
const PAGES = [
  ['/', '52 barangays', 'home renders the compiled barangay count'],
  ['/', '628.71', 'home renders the NAMRIA-derived municipal area'],
  ['/', '446.9', 'home renders the National Tax Allotment in millions'],
  ['/', '52 barangays on the public record', 'home carries the hero headline'],
  ['/budget', '446,931,453.96', "budget renders Labo's real National Tax Allotment"],
  ['/budget', '88.5', 'budget renders the computed NTA dependency ratio'],
  ['/budget', 'BLGF', 'budget cites the BLGF workbook basis'],
  ['/barangays', 'Anahaw', 'directory lists a real barangay'],
  ['/barangays', '0501606001', 'directory exposes real PSGC codes'],
  ['/barangays/0501606012', 'Anahaw', 'barangay page names the right barangay'],
  ['/barangays/0501606012', '0501606012', 'barangay page shows the PSGC code'],
  ['/barangays/0501606012', '0.390', 'barangay page shows the real land area'],
  ['/data', 'Philippine Barangay Boundaries', 'registry names the boundary source'],
  ['/data', 'Project NOAH Hazard Maps', 'registry titles the hazard dataset'],
  ['/data', 'BLGF Local Government Unit Fiscal Data', 'registry names the fiscal source'],
  ['/about', 'Not an emergency channel', 'about carries the emergency notice'],
  ['/about', 'independent', 'about carries the independence notice'],
  ['/projects', 'DPWH', 'projects page names the source'],
  ['/projects', 'Daguit', 'projects page attributes a real barangay'],
  ['/projects', '10,758', 'projects page renders the compiled contract total'],
  ['/officials', 'Sangguniang Bayan', 'officials page renders the legislature heading'],
  ['/officials', 'Municipal Budget Officer', 'officials page renders a real department head'],
  ['/officials', 'does not currently publish the names', 'officials page admits the mayor is unnamed rather than presenting an old name as current'],
  ['/documents', 'Published documents', 'documents page renders its heading'],
  ['/report', 'Report', 'report page renders the intake heading'],
  ['/report/track', 'reference', 'track page renders the lookup form'],
  ['/map', 'Anahaw', 'map page server-renders its barangay summary'],
  ['/console', 'console', 'console renders outside the public shell'],
];

console.log(`== fetching ${new Set(PAGES.map(([p]) => p)).size} routes on :${PORT} ==`);
for (const [path, needle, label] of PAGES) {
  const { status, body } = await get(path);
  if (status !== 200) {
    check(`${label} (${path})`, false, `HTTP ${status}`);
    continue;
  }
  check(`${label} (${path})`, body.includes(needle), `missing '${needle}'`);
}

console.log('== /api/health through the loopback bridge ==');
const health = await get('/api/health');
console.log(`  ${health.body.slice(0, 240)}`);
check(
  'the bridge boots the Express app and answers /api/health',
  health.body.includes('"ok":true'),
);
check('the API resolved the 52-barangay registry', health.body.includes('"count":52'));

console.log('== POST /api/reports — the intake path, in whatever DB mode is configured ==');
const post = await fetch(`${BASE}/api/reports`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    category: 'flood_drainage',
    barangayPsgc: '0501606012',
    subject: 'Live check',
    details: 'This submission is a live check. Writes go to a throwaway database (see LIVECHECK_DB).',
    locationLabel: 'Poblacion',
  }),
});
const postBody = await post.text();
/**
 * Two legitimate configurations, so the check adapts rather than asserting one:
 * with a database attached the intake must accept the report (201 + a reference
 * code); without one it must degrade to a clean `503 db_unavailable` instead of
 * failing opaquely. Asserting only the no-database case made this check fail the
 * moment a real `MONGODB_URI` was configured.
 */
if (post.status === 201) {
  let ref = null;
  try {
    // Item responses are wrapped: `{ item: { … } }` (see apps/api/src/http.ts).
    ref = JSON.parse(postBody).item?.referenceCode ?? null;
  } catch {
    /* not JSON */
  }
  check(
    'POST /api/reports persists and returns a reference code',
    typeof ref === 'string' && /^LB-\d{4}-\d{6}$/.test(ref),
    postBody.slice(0, 200),
  );
  console.log(`  filed a report into '${CHECK_DB}': ${ref}`);

  const lookup = await get(`/api/reports/lookup?referenceCode=${encodeURIComponent(ref ?? '')}`);
  check(
    'the report is retrievable by its reference code',
    lookup.status === 200 && lookup.body.includes(ref ?? '\u0000'),
    `HTTP ${lookup.status}`,
  );
} else {
  check(
    'POST /api/reports answers 503 db_unavailable without a database',
    post.status === 503 && postBody.includes('db_unavailable'),
    `HTTP ${post.status} ${postBody.slice(0, 160)}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) console.log(`--- server log tail ---\n${serverLog.slice(-1500)}`);
await dropCheckDb();
shutdown(fail > 0 ? 1 : 0);
