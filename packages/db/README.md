# @theopentranscribe/db

Part of [TheOpenTranscribe](../../README.md).

The SQLite database and file storage layout. Used by both the [web app](../web) and the [runner](../runner).

### Data folder

Everything lives in one folder, set with `DATA_DIR`:

```
DATA_DIR/
├── theopentranscribe.sqlite3     database (WAL mode)
├── uploads/
│   └── <job_id>__<filename>      uploaded media
└── outputs/
    └── <job_id>.txt              finished transcripts
```

All paths stored in the database are relative to `DATA_DIR`, and every path is checked to stay inside it.

### Usage

```ts
import { openDb, jobs, jobDocumentToRow, rowToJobDocument } from "@theopentranscribe/db";

// Creates the folder layout, enables WAL and runs pending migrations.
const db = openDb(process.env.DATA_DIR!);

db.insert(jobs).values(jobDocumentToRow(job)).run();
```

Rows map to and from the shared [job contract](../contract).

### Setup

Install this package **before** `runner` and `web`. `npm install` builds `dist/` automatically, and the other packages depend on it.

```bash
cd packages/db && npm install
```

If another package fails with `Cannot find module '@theopentranscribe/db'`, run `npm install` (or `npm run build`) here first.

### Scripts

| Command | Description |
|---|---|
| `npm test` | Run the tests |
| `npm run typecheck` | Type-check with `tsc` |
| `npm run build` | Compile to `dist/` |
| `npm run db:generate` | Create a migration after editing `src/schema.ts` |
| `DATA_DIR=… npm run db:migrate` | Apply pending migrations |
