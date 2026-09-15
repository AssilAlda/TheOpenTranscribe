# @theopentranscribe/runner

Phase 4: lightweight, single-worker TypeScript job runner.

Owns:
- Polling `packages/db` for `QUEUED` jobs and atomically claiming one at a time.
- Invoking the Phase 1 Python transcriber as a subprocess (via the thin
  `transcriber.run_job` adapter added alongside the standalone CLI — see
  `packages/transcriber/transcriber/run_job.py`).
- Writing `COMPLETED`/`FAILED` results back through `packages/db`.
- Marking stale `PROCESSING` jobs `FAILED` (never auto-retried) on startup.

Does **not** own: HTTP/API, UI, credential storage, auth, transcription logic
itself (that stays in `packages/transcriber`).

## Setup

Depends on `@theopentranscribe/db` via a local `file:../db` reference —
**install/build `packages/db` first** (`cd ../db && npm install`; its own
`prepare` script builds the `dist/` this package resolves against). See
`packages/db/README.md`'s "Consumption" section for why.

```
cd packages/db && npm install
cd ../runner && npm install
```

## Running

```
DATA_DIR=/path/to/data \
TRANSCRIBER_PYTHON_BIN=/path/to/TheOpenTranscribe/packages/transcriber/.venv/bin/python \
npm start
```

- `DATA_DIR` — required. Same `DATA_DIR` used by `packages/db`.
- `TRANSCRIBER_PYTHON_BIN` — required. Path to the `packages/transcriber`
  virtualenv's `python` executable (must have the `theopentranscribe`
  package installed editable — `pip install -e ".[dev]"` — and `openai` /
  `python-dotenv` available).
- `RUNNER_POLL_INTERVAL_MS` — optional, defaults to `5000`. Falls back to the
  default on invalid input.
- `OPENAI_API_KEY` must already be set in the runner process's own
  environment — the runner never reads, stores, or generates it; it only
  inherits `process.env` when spawning the subprocess.

Single-worker: claims and fully processes one job at a time, then
immediately attempts to claim the next one before falling back to polling on
an empty queue. No configurable concurrency, no subprocess wall-clock
timeout — both are locked v1 simplicity decisions (see
`docs/ARCHITECTURE.md` / `docs/IMPLEMENTATION_PLAN.md`), not permanent
architectural limits.

## Scripts

- `npm start` — runs the runner (`tsx src/index.ts`).
- `npm test` — Vitest suite, including a real (unmocked) subprocess-spawn
  integration test standing in for the Python entrypoint.
- `npm run typecheck` — `tsc --noEmit`.
