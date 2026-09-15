# @theopentranscribe/db

Phase 3: SQLite schema and local `DATA_DIR` storage for TheOpenTranscribe.

Owns:
- The `jobs` table (Drizzle + `better-sqlite3`, WAL mode), shaped around the
  Phase 2 JSON job contract (`packages/contract`).
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

- `npm test` — runs the Vitest suite.
- `npm run typecheck` — `tsc --noEmit`.
- `npm run db:generate` — regenerate a Drizzle migration after editing `src/schema.ts`.
- `DATA_DIR=/path/to/data npm run db:migrate` — apply pending migrations against a DATA_DIR.
