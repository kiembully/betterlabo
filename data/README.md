# `data/` — ETL working directory

This directory holds **inputs** to the ETL. Nothing here is served by the portal;
the compiled output the website reads lives in `apps/web/public/data/`.

| Path | Tracked? | What it is |
| --- | --- | --- |
| `data/sources/` | no — git-ignored | Raw upstream downloads (the 67 MB national boundary file, the BLGF workbooks, the NOAH province archives). Safe to delete; the ETL re-fetches. |
| `data/sources/_work/` | no | The provenance accumulator (`registry.json`) shared between individual task runs, so `etl barangays` followed by `etl fiscal` still produces a complete `datasets.json`. `etl all` rebuilds it. |
| `data/README.md` | yes | This file. |

## Supplying a source by hand

Some sources are real but are not published as a dataset, so the ETL cannot fetch
them. Drop the file in `data/sources/` with the exact name below and re-run the
task; the ETL picks it up and records it in the provenance registry.

### `psa-population.csv` — barangay population

Read by the `barangays` task. Attach an official PSA Census of Population extract
to fill the `population` field on each barangay (which is otherwise published as
`null` and rendered as an em dash).

```csv
psgc_code,population,source,year
0501606012,1234,PSA 2020 Census of Population and Housing,2020
0501606001,987,PSA 2020 Census of Population and Housing,2020
```

- `psgc_code` must be the 10-digit PSGC code (the same value as
  `barangays.json[].psgcCode`); leading zeros are preserved.
- `population` must be an integer. Rows that do not parse are skipped.
- `source` and `year` are optional but are copied into the compiled record so the
  portal can name where the figure came from.

The task logs how many rows it applied and the compiled index records
`populationCoverage`, so a partial extract is visible rather than silent.
