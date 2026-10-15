# Contributing to BetterLabo

Thank you for helping. This project exists to make Labo's public record readable,
and the most valuable contribution is a **correction**.

## Reporting a wrong figure

A number that disagrees with the official record is a bug. Open an issue with:

1. the portal route and the figure you saw (e.g. `/budget`, "National Tax
   Allotment, FY 2024");
2. the value you expected;
3. the source document that says so — a URL, or the workbook, sheet and row.

Do not open a pull request that edits
`apps/web/public/data/*.json` directly. That directory is generated, and the next
scheduled refresh would silently revert your change. Fix the ETL instead, or
report the source and we will.

## Adding a data source

1. Resolve the file URL against the portal's own API rather than guessing it:
   ```bash
   curl 'https://data.bettergov.ph/api/v1/datasets?limit=100&offset=0'
   curl 'https://data.bettergov.ph/api/v1/resources?dataset_id=<id>&limit=100&offset=0'
   ```
2. Add an entry to `tools/etl/src/lib/sources.mjs`, copying the licence,
   licence URL and attribution text **from the dataset record**.
3. Add a task in `tools/etl/src/scripts/`, call `recordProvenance` with the files
   it produced, and register the task in `src/cli.mjs`.
4. Add assertions to `scripts/verify.mjs` so a silent upstream change fails the
   refresh rather than shipping.
5. Run `npm run etl <task> && npm run etl:verify` and commit the compiled output
   **and** the task together.

Full detail in [`docs/data-sources.md`](docs/data-sources.md).

## Ground rules

- **Never invent a figure, a citation, a URL or a row count.** If you cannot
  verify it, leave the field `null` and add the field to `PENDING_FIELDS` in
  `tools/etl/src/lib/sources.mjs` with the reason. A blank is a valid answer; a
  plausible wrong number is not.
- **`null` renders as an em dash, never as `₱0.00`.** Zero and "not reported" are
  different facts.
- **Publish the judgement, not just the result.** If a task has to decide
  something the source does not — which column is a total, which hazard polygons
  belong to this municipality — put the decision in the output's `note` so a
  reader can disagree with it.
- **No political content.** No commentary on officials, candidates, parties or
  administrations. Publish what the records say and link to them.

## Local development

```bash
npm install
npm run build:shared
cp .env.example .env.local
npm run etl all          # or a single task; see the README for fetch sizes
npm run dev              # portal :3000, API :4000
```

Before opening a pull request:

```bash
npm run typecheck
npm run build
npm run etl:verify
npm run lint
```

All four must pass. `npm run etl:verify` runs offline against the committed data,
so a red result means this repository disagrees with itself.

## Code conventions

- TypeScript strict everywhere; `noUnusedLocals` and `noUncheckedIndexedAccess`
  are on.
- `packages/shared` is the only place a wire shape is defined. Add a type there
  and import it — do not redeclare a shape in an app.
- Inside `apps/api/src`, every relative import carries the `.js` extension
  (NodeNext ESM). This fails both `tsc` and the runtime identically.
- Tailwind v4 fails the build on an unknown utility. Use the tokens and
  `@utility` names in `apps/web/app/globals.css`; do not invent class names and do
  not use `@apply`.
- Server-only modules must not be imported by a client component. Fetch
  `/data/*` in the browser instead.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`). Keep a
generated-data refresh in its own commit (`chore(data): …`) so the code diff stays
readable.

## Licence

By contributing you agree your work is licensed under the MIT licence in
[`LICENSE`](LICENSE). Source data keeps its own licence, recorded per dataset at
`/data`.
