# Architecture

## The shape of the system

```
                    build time                     request time
  ┌──────────────┐   ┌─────────┐   ┌───────────────┐   ┌────────────┐
  │ government   │──►│  ETL    │──►│ public/data/  │──►│  Next page │
  │ sources      │   │ tools/  │   │ *.json        │   │  (static)  │
  └──────────────┘   │ etl/    │   │ *.geojson     │   └────────────┘
                     └────┬────┘   └───────────────┘
                          │
                          └──► datasets.json (provenance registry)

  ┌────────────┐   ┌──────────────────┐   ┌──────────────┐
  │ /report    │──►│ /api/[...path]   │──►│ Express 5 +  │
  │ /console   │   │ loopback bridge  │   │ Mongoose 9   │
  └────────────┘   └──────────────────┘   └──────┬───────┘
                                                 │
                                          ┌──────▼───────┐
                                          │   MongoDB    │
                                          └──────────────┘
```

The two halves are independent. The public portal is a set of static pages over
committed JSON and never calls the API; the reporting API is the only component
that needs a running database.

## Why static-first

The brief's constraint is a portal that costs nothing to keep running and cannot
fall over. That rules out a page render that fans out to four government websites
— which would also be a scraping load on public infrastructure and would break the
moment any of those hosts was slow, blocked or restructured. So:

- upstream fetching happens in **one scheduled job**, not per visitor;
- that job writes files, and it records what it did;
- pages read those files;
- a human reviews the diff in the refresh commit.

The cost of this choice is latency: a portal refresh is up to a day behind an
upstream publication. That is stated on `/data` rather than hidden.

## The ETL

`tools/etl/` is a plain Node ESM workspace with no build step. `src/cli.mjs`
dispatches tasks; each task lives in `src/scripts/` and shares five libraries:

| Library | Responsibility |
| --- | --- |
| `lib/http.mjs` | `node:https` downloads with resumable transfers, redirect handling, a browser-like UA, and range-request byte sources for Parquet |
| `lib/geo.mjs` | turf wrappers, coordinate rounding, polygon clipping, and the point-in-polygon tests the hazard clipping needs |
| `lib/xlsx.mjs` | merge-aware reading of the BLGF workbooks: header band discovery, label paths, LGU row location |
| `lib/write.mjs` | deterministic JSON writes with a `dataHash` so an unchanged refresh produces no diff |
| `lib/registry.mjs` | the provenance accumulator behind `datasets.json` |

Tasks: `barangays` → `profile` → `fiscal` → `projects` → `hazards` → `registry`,
plus `verify`.

### Judgement calls, and why they are published

Every task had to make a decision the source does not make for it — which column
is the total, which hazard polygons belong to Labo, whether a caption's unit can
be trusted. Each decision ends up in the output as a `note` on the affected
record rather than as a comment in the code, because the person reading a figure
is the one who needs to know how it was produced.

The two that changed what the portal displays:

**Hazard clipping.** A bounding-box clip was the first implementation. On the
storm-surge layer it produced three province-scale polygons covering all of Labo
and a map that would have told residents of inland barangays they live in a
storm-surge zone. Testing the kept polygons' interior points against the
municipal outline showed the true answer: **zero** overlap. The same test promoted
the flood layer from "clipped fragments" to a real classification — **36 of 52
barangays contain mapped flood hazard**.

**A shapefile class field named two different things.** The storm-surge archive
carries `HAZ`; the flood archive carries `Var`. Reading a fixed name produced
`hazard_class: null` on every flood feature — a hazard map with no severity
levels, and no error. The field is now resolved from each layer's own properties.

## The contract

`packages/shared` is built to `dist` and imported by name from three consumers:
the API, the Next server, and the browser. It holds the wire types, the zod
schemas, the domain constants (PSGC codes, report taxonomy, routing table) and the
formatters — including the rule that `null` renders as an em dash. It is the only
place a shape is defined.

It is built rather than imported as source because a NodeNext `.js` specifier does
not resolve back to `.ts` under Turbopack; consumers importing `dist` need no
`transpilePackages`, no cross-workspace `paths`, and no `rootDir` gymnastics.

## The API

Express 5 + Mongoose 9, TypeScript, ESM with NodeNext resolution — so **every
relative import inside `apps/api/src` carries the `.js` extension**. It is
mounted, not exposed:

```
Browser ──► /api/*  (same origin, no CORS, first-party cookie)
              │
              └──► app/api/[...path]/route.ts  (Next route handler)
                        │  boots once per process
                        └──► Express on 127.0.0.1:<random port>
```

`API_INTERNAL_URL` short-circuits the loopback boot when the API runs as its own
service.

Three details this bridge has to get right, all of which are silent failures
otherwise:

1. **The catch-all param drops the mount prefix.** `/api/health` arrives as
   `["health"]`, so the target is rebuilt as `${base}/api/${path.join("/")}`.
2. **The app is only usable once its database connection has settled.** A
   fire-and-forget `connect()` renders pages fine while every `/api/*` request
   races the connection — `await` it inside the boot promise, and reset the cached
   promise on failure so a later request can retry.
3. **A broken API must not break the portal.** If the workspace cannot be
   imported, the route answers a documented `503 db_unavailable` envelope; the
   public pages are unaffected because they never call it.

The database is optional by design. With no `MONGODB_URI` the API boots, `/api/health`
reports `db: "unavailable"`, report submission returns `503`, and the whole portal
still works — which is what a reviewer cloning this repo should see.

## Front-end structure

- `app/(site)/layout.tsx` carries the public masthead and footer; `app/console/`
  is outside that route group, so the admin surface renders no public chrome with
  no conditional CSS.
- `lib/data.ts` is `server-only`. It is the only module that touches the
  filesystem, and every reader is total — a missing file returns `null` and the
  page renders a designed empty state naming the ETL command, so `next build`
  never fails because an upstream host was down.
- Client components that need data fetch `/data/*` themselves rather than
  importing `lib/data.ts`, which would drag `node:fs` into the browser bundle.
- Filter and search state lives in the URL, so a filtered view is a shareable
  link and the server can render the result.
- The design tokens live in `app/globals.css` (`@theme` + `@utility`), anchored to
  the BetterGov.ph Kapwa palette so this portal reads as a sibling of the other
  BetterLGU sites. Tailwind v4 fails the build on an unknown utility, which is why
  the token list is the single source for colour and component vocabulary.

## What would change at scale

- **Per-barangay fiscal data** would need a source that reports at barangay level;
  BLGF reports per LGU, so the budget explorer is municipal by nature and says so.
- **Audit reports (COA)** are PDFs. Extracting them is a real project, not a
  wiring task, which is why they are listed as pending.
- **A second LGU** would generalise the ETL by replacing the hard-coded
  `PH0501606` constant with configuration; the pipeline itself is not
  Labo-specific.
