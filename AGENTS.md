# AGENTS.md — working in this repository

Conventions for automated agents and anyone making a change here. `CONTRIBUTING.md`
holds the contribution process; this file holds the rules that are specific to how
this repo is put together.

## Non-negotiables

1. **`apps/web/public/data/` is generated.** Never hand-edit it. Change the ETL in
   `tools/etl/` and re-run it. A hand edit is reverted by the next scheduled refresh.
2. **`packages/shared` is built to `dist`.** Never import its TypeScript source
   across a workspace boundary. Build it first: `npm run build:shared`. Turbopack
   does not resolve a NodeNext `.js` specifier back to `.ts`.
3. **Inside `apps/api/src`, every relative import carries the `.js` extension.**
   NodeNext ESM. `import { createApp } from "./app.js"`.
4. **`null` renders as an em dash.** Never `₱0.00`, never `0`. The compiled data
   uses `null` for "the source did not report this".
5. **No invented citations.** Every source URL is resolved from the BetterGov
   portal API and every licence string is copied from the dataset record.
6. **Tailwind v4 fails the build on an unknown utility.** Use the tokens and
   `@utility` names in `apps/web/app/globals.css`. No `@apply`, no new class names,
   no `tailwind.config` file — the theme is CSS-first.
7. **`@/lib/data.ts` is `server-only`.** A client component importing it drags
   `node:fs` into the browser bundle and fails the build. Client code fetches
   `/data/<file>` directly.

## Layout

| Path | What lives there |
| --- | --- |
| `apps/web/app/(site)/` | public routes; the route group that carries the public shell |
| `apps/web/app/console/` | admin routes, deliberately outside that group |
| `apps/web/app/api/[...path]/` | the loopback bridge that mounts the Express app |
| `apps/web/components/ui/primitives.tsx` | shared presentational primitives — reuse, do not duplicate |
| `apps/web/lib/data.ts` | server-only readers for the compiled JSON (all total) |
| `apps/web/lib/api.ts` | browser-side API client (`apiGet`/`apiPost`/`apiPatch`, `describeError`) |
| `packages/shared/src/` | wire types, zod schemas, domain constants, formatters |
| `apps/api/src/` | Express 5 + Mongoose 9 reporting API |
| `tools/etl/src/` | the ETL (`lib/` shared helpers, `scripts/` one task per file) |
| `data/sources/` | raw upstream downloads, git-ignored |

## Adding a compiled dataset

1. Declare the source in `tools/etl/src/lib/sources.mjs` (URL, licence, licence
   URL, attribution, source version).
2. Write `tools/etl/src/scripts/<task>.mjs` exporting `run(ctx)`, and call
   `recordProvenance({...})` with `outputs` listing every file it wrote.
3. Register the task in `tools/etl/src/cli.mjs` (`TASKS`, `RUNNERS`, `order`).
4. Add assertions to `scripts/verify.mjs`.
5. Add a reader to `apps/web/lib/data.ts` and the file name to `DATA_FILES`.
6. Add the shape to `packages/shared/src/types.ts`, then `npm run build:shared`.
7. Run `npm run etl <task> && npm run etl:verify && npm run typecheck`.

## Determinism

`writeStableJson` stores a `dataHash` of the payload and preserves the previous
`generatedAt` when nothing changed, so an unchanged refresh writes nothing and
produces no diff. Do not bypass it with a plain `writeFile`, and do not include a
timestamp inside the hashed payload.

## Verification

```bash
npm run build:shared      # must precede anything else
npm run typecheck         # all workspaces
npm run build             # shared → api → web
npm run etl:verify        # offline assertions over the committed data
npm run smoke             # API assertions against a real mongod
```

A change to the ETL is not done until `etl:verify` passes and the compiled output
is committed alongside it.

## Environment quirks

- **`blgf.gov.ph` rejects Node's `fetch`** with `NGHTTP2_PROTOCOL_ERROR`, and a
  bare user agent with `403`. The ETL uses `node:https` with ALPN pinned to
  HTTP/1.1 plus a browser-like UA and Referer. Do not "simplify" that back to
  `fetch`.
- **HuggingFace egress measured ~0.05 MB/s** on one development network. Downloads
  are resumable; keep them that way. A truncated archive must be detected (the zip
  central directory will not open) and replaced rather than trusted.
- **`shpjs` is browser-first** and dereferences `self.DecompressionStream` at module
  scope. It must be imported dynamically *after* `globalThis.self = globalThis`.
- **Local paths:** this repo is developed on Windows with git-bash. Native tools
  (`node`, `git`, `curl`) are not given MSYS path translation — pass
  `C:/Users/...`-style paths, not `/c/Users/...`.
