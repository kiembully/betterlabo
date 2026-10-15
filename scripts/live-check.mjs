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
 * Spawn the Next binary directly rather than through `npx …` with `shell: true`.
 * A shell wrapper means `child.kill()` kills the WRAPPER, the real server keeps
 * the port, and the next run then either fails to bind or — worse — asserts
 * against a server built from code that no longer exists on disk. Spawning node
 * itself makes the kill exact.
 */
const child = spawn(
  process.execPath,
  [join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)],
  {
    cwd: join(repoRoot, 'apps', 'web'),
    stdio: ['ignore', 'pipe', 'pipe'],
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

console.log('== POST /api/reports with no database answers a clean 503 ==');
const post = await fetch(`${BASE}/api/reports`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    category: 'flood_drainage',
    barangayPsgc: '0501606012',
    subject: 'Live check',
    details: 'This submission is a live check against a deployment with no database attached.',
    locationLabel: 'Poblacion',
  }),
});
const postBody = await post.text();
check(
  'POST /api/reports answers 503 db_unavailable without a database',
  post.status === 503 && postBody.includes('db_unavailable'),
  `HTTP ${post.status} ${postBody.slice(0, 160)}`,
);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) console.log(`--- server log tail ---\n${serverLog.slice(-1500)}`);
shutdown(fail > 0 ? 1 : 0);
