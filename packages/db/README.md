# @theopentranscribe/db

SQLite schema and local `DATA_DIR` storage for TheOpenTranscribe.

Owns:
- The `jobs` table (Drizzle + `better-sqlite3`, WAL mode), shaped around the
  JSON job contract (`packages/contract`).
- Migrations (`drizzle/`).
- `DATA_DIR` layout and path-safety helpers for application-managed storage.
- Mapping between DB rows and a `JobDocument`-shaped object.

Does **not** own (out of scope for this package): runner polling/execution,
HTTP/API, dashboard UI, credential storage, auth.

## DATA_DIR layout

```
DATA_DIR/
├── theopentranscribe.sqlite3          (+ -wal / -shm siblings, created by SQLite)
├── uploads/
│   └── <job_id>__<safe_original_filename>
└── outputs/
    └── <job_id>.txt
```

## Usage

```ts
import { openDb, jobs, jobDocumentToRow, rowToJobDocument } from "@theopentranscribe/db";

const db = openDb(process.env.DATA_DIR!); // creates DATA_DIR layout, enables WAL, runs migrations

db.insert(jobs).values(jobDocumentToRow(jobDocument)).run();
```

## Scripts

- `npm test` — runs the Vitest suite (imports `../src/*.js` directly; unaffected by `dist/`).
- `npm run typecheck` — `tsc --noEmit`.
- `npm run build` — compiles `src/` to `dist/` (via `tsconfig.build.json`).
- `npm run db:generate` — regenerate a Drizzle migration after editing `src/schema.ts`.
- `DATA_DIR=/path/to/data npm run db:migrate` — apply pending migrations against a DATA_DIR.

## Consumption: this package must be `npm install`ed before its consumers

`main`/`types` point at `dist/index.js` / `dist/index.d.ts`, **not** raw `src/`. This
package's own source (`src/*.ts`) uses explicit `.js`-suffixed relative imports — the
standard TypeScript NodeNext convention where those extensions describe the *compiled*
output, which is exactly what makes `dist/` resolve correctly for any consumer, whether
it loads the package via plain Node/`tsx` (`packages/runner`) or a bundler
(`packages/web`'s Next.js/Turbopack) — neither `tsx` nor a bundler can resolve `main`
pointing at a `dist/index.js` that doesn't exist yet, regardless of which one is
consuming it.

`dist/` is build output — intentionally **not** committed (matched by the repo's
`dist/` `.gitignore` rule) — so it must be produced locally. This package has a
`prepare` script (`npm run build`) so **running `npm install` in this directory builds
`dist/` automatically**; both `packages/runner` and `packages/web` depend on this
package via a local `file:../db` reference, and npm also re-runs this `prepare` script
when *their* `npm install` resolves that local dependency (failing loudly, not
silently, if this package's own `node_modules` isn't present yet to satisfy it).

**Practical consequence:** install this package first —

```
cd packages/db && npm install       # builds dist/ automatically via prepare
cd ../runner && npm install         # or: cd ../web && npm install
```

If a consumer's install or typecheck ever fails with `Cannot find module
'@theopentranscribe/db'` or `Failed to resolve entry for package
"@theopentranscribe/db"`, this package hasn't been installed/built yet — run
`npm install` here first (or `npm run build` if `node_modules` already exists).
