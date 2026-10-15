# BetterLabo

An open-source digital transparency and citizen-engagement portal for the
**Municipality of Labo, Camarines Norte** — built to the [BetterGov.ph
BetterLGU](https://lgu.bettergov.ph/GUIDE) standards, with every figure traceable
to the government file it came from.

**Status:** working portal, first public release. 52 barangays mapped · 31
compiled fiscal sections from BLGF FY 2024 · 309 DPWH projects located inside
Labo barangays (₱10.76 B, 2016–2025) · Project NOAH flood layer clipped to the
municipal outline · 45 automated data-integrity assertions.

> **Not an official website of the Municipality of Labo**, and not affiliated
> with any political party or candidate. Independent, volunteer-built civic
> technology.

---

## What it does

| Module | Route | Data behind it |
| --- | --- | --- |
| **Interactive municipal & hazard map** | `/map` | 52 barangay polygons (PSA PSGC + NAMRIA), municipal outline, Project NOAH hazard layers clipped to Labo |
| **Local budget explorer (FDPP)** | `/budget` | BLGF FY 2024 Statement of Receipts and Expenditures, Annual Regular Income and Dependencies, Special Education Fund, LDRRMF |
| **Barangay directory & profiles** | `/barangays` | PSGC codes, NAMRIA-derived land areas, centroids, per-barangay mapped hazard exposure |
| **Public works projects** | `/projects` | DPWH Infrastructure Transparency Dataset, filtered to Labo |
| **Citizen reporting** | `/report` | Express + MongoDB intake with rate limiting, Turnstile and a reference code |
| **Provenance registry** | `/data` | Every source: publisher, licence, retrieval date, row count, checksum, outputs |
| **Administrative console** | `/console` | Triage, status, priority and office assignment for incoming reports |

## What it does **not** do

This matters more than the feature list:

- **No live scraping.** Every page renders from static JSON compiled at build
  time by the ETL. No government website is queried while you read a page.
- **No guessed numbers.** A field with no verified source is published as
  `null` and rendered as an em dash — never as `₱0.00`, never as an estimate.
- **No invented citations.** Every source URL in the registry was resolved
  against the portal's own API and every licence string was copied from the
  dataset record.
- **No officials, ordinances or AIP line items yet.** Those have no
  machine-readable source; they are listed as pending on `/data` and `/about`
  rather than transcribed from an unverifiable page.
- **No population figures.** PSA publishes barangay-level census data as
  publications, not as a dataset. The ETL will join an official extract placed at
  `data/sources/psa-population.csv`; until one is supplied the field stays null.

---

## Repository layout

```
betterlabo/
├── apps/
│   ├── web/                      Next.js 16 App Router portal (static-first)
│   │   ├── app/(site)/           public routes, with their own shell
│   │   ├── app/console/          admin console, deliberately outside that shell
│   │   ├── app/api/[...path]/    the bridge that mounts the Express app
│   │   ├── components/           UI primitives and per-module components
│   │   ├── lib/data.ts           SERVER-ONLY readers for the cached JSON
│   │   └── public/data/          ← the compiled cached data (committed)
│   └── api/                      Express 5 + Mongoose 9 reporting API
├── packages/shared/              the frozen wire contract: types, zod, constants
├── tools/etl/                    the build-time ETL that produces public/data
├── docs/                         architecture, data sources, limitations
└── data/sources/                 raw upstream downloads (git-ignored)
```

The one rule that keeps this honest: **`apps/web/public/data/` is generated, and
its generators live in `tools/etl/`.** If you add a figure to the portal, you add
a task to the ETL that produces it, with a source URL and a licence.

---

## Getting started

```bash
# Node 22+ (developed on 26.7) and npm 11
npm install
# Both built workspaces must exist before anything can be typechecked or built:
# packages/shared (imported by name) and apps/api (its `types` point at dist/,
# so `apps/web` cannot typecheck without it). `npm run typecheck` also guards
# this with a `pretypecheck` hook.
npm run build:shared && npm run build:api
cp .env.example .env.local    # every value has a default; nothing is required

# 1. Compile the cached data (needs network; see "Fetch sizes" below)
npm run etl all

# 2. Run everything
npm run dev                   # shared watch + API :4000 + portal :3000
```

With no `MONGODB_URI`, the API boots in a no-database mode: `/api/reports`
answers `503 db_unavailable` and **every public page still renders**, because the
portal reads static JSON and never calls the API. To exercise the reporting flow,
`npm run dev:memory` boots a real in-memory mongod.

### Portals and processes

| Command | What it does |
| --- | --- |
| `npm run dev` | `packages/shared` watch + Express API + Next dev server |
| `npm run dev:memory` | API on a real in-memory mongod (no Atlas needed) |
| `npm run build` | shared → api → web, in that order |
| `npm run typecheck` | every workspace, `tsc --noEmit` |
| `npm run lint` | `eslint` for the web workspace |
| `npm run etl <task…>` | `barangays`, `profile`, `fiscal`, `projects`, `hazards`, `registry`, `verify`, `all` |
| `npm run etl:verify` | re-checks the compiled files against each other (offline) |
| `npm run smoke` | end-to-end assertions against a real mongod |

### ETL flags

- `--force` — ignore cached downloads and re-fetch every upstream file.
- `--offline` — never touch the network; fail a task that needs it, loudly.
- `--cached-only` — use only what is already in `data/sources/` (this is how a
  hazard refresh is skipped when you cannot spare the bandwidth).

### Fetch sizes (read this before `npm run etl all`)

| Source | Download |
| --- | --- |
| Philippine barangay boundaries | 67 MB + 6 MB (GitHub, fast) |
| BLGF fiscal workbooks | 2 MB total |
| DPWH Parquet (24 MB, 248,220 rows) | downloaded once, then read from disk; HTTP range reads as the fallback |
| Project NOAH province archives | ~320 MB total (HuggingFace) |

HuggingFace egress measured **~0.05 MB/s** from one development network, which
makes the landslide archive a 45-minute transfer. Every download is therefore
resumable, a truncated archive is detected and replaced rather than trusted, and
the CI job caches `data/sources/` between runs.

---

## How the data is compiled

```
upstream source ──► tools/etl task ──► apps/web/public/data/*.json ──► Next page
                         │
                         └──► datasets.json (provenance registry)
```

Each task records what it did in `datasets.json`: publisher, portal dataset id,
licence and licence URL, attribution text, retrieval timestamp, source version,
rows compiled, bytes downloaded, sha256 of the source archive, the files it
produced, and a note describing any transformation judgment it had to make.

`writeStableJson` stores a `dataHash` of the payload and keeps the previous
`generatedAt` when the hash is unchanged, so a nightly refresh of unchanged
upstream data produces **no commit** instead of 365 commits a year.

### Data sources

| Dataset | Publisher | Licence | Portal id |
| --- | --- | --- | --- |
| Philippine Barangay Boundaries (Hierarchical GeoJSON) | Manuel Balmeo — PSA PSGC (2023-10-24) + NAMRIA boundaries (2023-11-06) | MIT | [23](https://data.bettergov.ph/datasets/23) |
| BLGF Local Government Unit Fiscal Data | Bureau of Local Government Finance | Public Domain | [9](https://data.bettergov.ph/datasets/9) |
| DPWH Infrastructure Transparency Dataset | DPWH | CC0 1.0 | [19](https://data.bettergov.ph/datasets/19) |
| Project NOAH Hazard Maps | Project NOAH, DOST | ODC-ODbL | [22](https://data.bettergov.ph/datasets/22) |

Full detail, including the exact file URLs and the transformations applied, is in
[`docs/data-sources.md`](docs/data-sources.md) and at `/data`.

### Three transformations worth knowing about

1. **Labo's barangays are selected by PSGC code**, not by name:
   `ADM3_PCODE === "PH0501606"` over a 42,026-feature national file returns
   exactly 52 features. `npm run etl:verify` fails if that count ever changes.
2. **Hazard layers are clipped to the municipal outline, not its bounding box.**
   A bounding-box clip pulls in hazard belonging to the neighbouring
   municipalities; every kept polygon's interior point is tested against the
   Labo outline, and the discarded count is published. This is how the
   storm-surge layer was found to have **zero** overlap with Labo — a fact a
   bbox clip would have hidden behind 3 province-wide polygons.
3. **Where the source's own total disagrees with its components, both are
   published and the disagreement is stated on the page.** One BLGF section does
   not foot; the note names the two numbers.

---

## Verification

```bash
npm run typecheck   # every workspace
npm run build       # shared → api → web
npm run lint        # apps/web
npm run etl:verify  # 45 assertions over the compiled data, offline
npm run smoke       # 34 API assertions against a real mongod
npm run check:live  # 27 assertions against the production build + the /api bridge
```

`check:live` boots `next start` on a private port and asserts values only the
compiled data can produce — the real National Tax Allotment, the computed 88.51%
dependency ratio, a barangay's PSGC code and 0.390 km² area, the DPWH contract
total — because a green `next build` with an empty page is a real failure mode.

`etl:verify` is the one that matters for trust. It asserts, among other things,
that the barangay index and the GeoJSON agree feature-for-feature, that the
barangay areas sum to the municipal area within 2%, that every fiscal sheet
declares a source basis and a unit, that dependency ratios are percentages, that
every `static` hazard layer has features and a file on disk, and that every
declared source carries a licence and a URL.

The scheduled workflow runs the ETL and then `etl:verify`, and **only commits if
the verification passes** — a silent upstream change fails the refresh instead of
shipping.

---

## Deployment

One Vercel project, Root Directory `apps/web`. The portal is static; the
reporting API is mounted in-process by `app/api/[...path]/route.ts` on a loopback
port, which keeps the console's session cookie first-party and avoids CORS.
`API_INTERNAL_URL` overrides that when the API runs as its own service.

Set at minimum: `NEXT_PUBLIC_SITE_URL`, `MONGODB_URI`, `ADMIN_TOKEN`,
`ADMIN_SESSION_SECRET`, and `TURNSTILE_MODE=enforce` with a real
`TURNSTILE_SECRET_KEY` before opening the reporting form to the public. Atlas must
allow `0.0.0.0/0` (or Vercel's static IPs); while it does not, the API answers a
clean `503 db_unavailable` and the portal is unaffected.

See [`.env.example`](.env.example) for the full list.

---

## Contributing

Corrections are the most valuable contribution. If a figure here disagrees with
the official record, that is a bug — open an issue with the source document and
the value you expected. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

The portal has no political content and will not accept any. It publishes what
the records say and links to them.

## Licence

MIT for the portal and the ETL. The compiled data keeps the licence of its
source, listed per dataset at `/data`. Attribution for every dataset is carried
in `datasets.json` and reproduced on the pages that use it.

Built for the people of Labo, Camarines Norte — 52 barangays, one public record.
