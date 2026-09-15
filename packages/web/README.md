# @theopentranscribe/web

Phase 5: Web API (Next.js Route Handlers). Phase 6's dashboard UI will be
added to this same package later (docs/ARCHITECTURE.md §15 locks Phase 5 and
Phase 6 into one shared Next.js application).

Owns:
- Upload handling + validation (extension allowlist, streaming size limit,
  lightweight container-signature check, safe DATA_DIR-confined storage).
- Job creation (`QUEUED` rows via `packages/db`).
- Job history and detail queries.
- Serving completed transcript results.

Does **not** own: transcription itself, starting/managing the Phase 4 runner
process, authentication, credential storage.

## Setup

Depends on `@theopentranscribe/db` via a local `file:../db` reference --
**install/build `packages/db` first** (`cd ../db && npm install`; its own
`prepare` script builds the `dist/` this package resolves against). See
`packages/db/README.md`'s "Consumption" section for why.

```
cd packages/db && npm install
cd ../web && npm install
```

## Running

```
DATA_DIR=/path/to/data npm run dev    # http://localhost:3000
DATA_DIR=/path/to/data npm run build && DATA_DIR=/path/to/data npm start
```

- `DATA_DIR` — required. Same `DATA_DIR` used by `packages/db` and
  `packages/runner`.
- The API never starts or manages a runner process -- run
  `packages/runner` separately against the same `DATA_DIR` for jobs to
  actually be processed.

## Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/jobs` | `POST` | Upload a media file (`multipart/form-data`, fields: `file`, optional `language`), create a `QUEUED` job. Returns `201`. |
| `/api/jobs` | `GET` | Paginated job history (`?limit=&offset=`), newest first. |
| `/api/jobs/:jobId` | `GET` | A single job's current state. |
| `/api/jobs/:jobId/result` | `GET` | The completed transcript as `text/plain`. `409` if not yet `COMPLETED`. |

Responses are `{ data: ... }` on success, `{ error: { code, message } }` on
failure, with a real HTTP status code in both cases.

## Upload implementation (locked at Phase 5 phase start -- docs/ARCHITECTURE.md §15)

- Extension allowlist: `.mp3 .mp4 .mpeg .mpga .m4a .wav .webm` (case-insensitive).
- Max size: 100 MiB, enforced **while streaming** (not after full receipt).
- Transport: `export const runtime = "nodejs"` (never Edge) +
  `@fastify/busboy`, bridging the Fetch `Request.body` stream via
  `Readable.fromWeb()` -- **not** `request.formData()`, which cannot enforce
  the size limit mid-stream.
- The file streams to a distinctively-named temp file inside
  `DATA_DIR/uploads/` first; only after extension + signature + language
  validation succeeds is it atomically renamed to the final
  `<job_id>__<safe_filename>` path and the `QUEUED` row inserted. Any
  failure along the way cleans up its own temp/final file; a hard process
  crash between rename and DB insert is the one accepted residual risk (see
  docs/ARCHITECTURE.md §15).

## Interaction with `packages/db`

Everything DB-shaped reuses `packages/db` directly: `openDb`, `jobs`,
`jobDocumentToRow`, `rowToJobDocument`, and the `DATA_DIR` path-safety
helpers (`resolveWithinDataDir`, `buildUploadRelativePath`,
`sanitizeFilenameSegment`, etc.). No new persistence or contract-validation
layer was introduced (see docs/ARCHITECTURE.md §15's "validation/schema
library" decision).

`@theopentranscribe/db` is consumed as a compiled package (`dist/`, built via
its own `prepare`/`build` script) rather than raw TypeScript source, because
Next.js's bundler (Turbopack, the default; also verified under webpack)
cannot resolve a sibling package's NodeNext-style `.js`-referencing-`.ts`
internal imports through a `file:` symlink. This only changes `packages/db`'s
`main`/`types` packaging -- no source file's behavior changed, and
`packages/runner`'s existing tsx-based consumption is unaffected (verified:
45/45 `packages/db` tests and 42/42 `packages/runner` tests still pass
unchanged). `npm install` in `packages/db` builds `dist/` automatically (see
its README) -- do that first if this package's install/build ever fails with
`Cannot find module '@theopentranscribe/db'`.

## Scripts

- `npm run dev` / `npm run build` / `npm start` -- Next.js dev/build/serve.
- `npm test` -- Vitest suite (unit tests for validation/parsing logic, plus
  route-handler tests calling the exported `GET`/`POST` functions directly
  against a real temporary `DATA_DIR`).
- `npm run typecheck` -- `tsc --noEmit`.
