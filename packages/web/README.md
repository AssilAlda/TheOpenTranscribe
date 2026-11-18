# @theopentranscribe/web

Web API (Next.js Route Handlers) + dashboard UI, sharing one Next.js
application in a single package.

Owns:
- Upload handling + validation (extension allowlist, streaming size limit,
  lightweight container-signature check, safe DATA_DIR-confined storage).
- Job creation (`QUEUED` rows via `packages/db`).
- Job history and detail queries.
- Serving completed transcript results (plain text and on-demand PDF export).
- The dashboard UI: a persistent application shell (Transcribe /
  Transcribed Files / Provider), paginated job history, a job detail modal
  (with a direct-URL fallback route), transcript reading/copy/PDF export.

Does **not** own: transcription itself, starting/managing the runner
process, authentication, the credential storage/persistence primitives
themselves (those live in `packages/provider-config`).

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
| `/api/jobs/:jobId/result/pdf` | `GET` | The completed transcript rendered as an on-demand, never-persisted `application/pdf` download. `409` if not yet `COMPLETED`; `422 unsupported_pdf_characters` if the transcript has characters the vendored font can't render. |
| `/` | page | **Transcribe** -- the upload workspace. One focused task: start a transcription. |
| `/files` | page | **Transcribed Files** -- the full paginated job history/management surface. Row click opens the job detail modal; polling keeps every visible active job live regardless of which page it's on. |
| `/jobs/:jobId` | page | **Direct/fallback job detail** -- same status/result content as the modal (shared component, no forked logic), reachable via bookmark, direct URL, refresh, or a modified click (new tab/copy link) from a Transcribed Files row. Not the normal interaction path. |
| `/provider` | page | **Provider** -- configure, replace, or remove a managed OpenAI API key, or see that `OPENAI_API_KEY` from the server environment is in use (see below). |

The persistent application shell (a left sidebar on desktop, a bottom tab bar
on mobile -- `src/components/AppShell.tsx`, `Sidebar.tsx`, `MobileTabBar.tsx`)
wraps all four pages via the root `app/layout.tsx`, with exactly these three
primary destinations: Transcribe, Transcribed Files, Provider.

JSON API responses are `{ data: ... }` on success, `{ error: { code, message } }` on
failure, with a real HTTP status code in both cases. `/api/jobs/:jobId/result`
and `/api/jobs/:jobId/result/pdf` return the transcript/PDF body directly on
success (not the JSON envelope), still using the JSON error envelope on failure.

## Upload implementation

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
  crash between rename and DB insert is the one accepted residual risk.

## Dashboard

- No CSS framework/component library -- `app/globals.css` design tokens
  (CSS custom properties) + CSS Modules per component. React Client
  Components fetch the existing JSON API directly (`src/lib/apiClient.ts`);
  Server Components are used only for the static page shells.
- **Application shell:** persistent desktop sidebar / mobile bottom tab bar,
  exactly three destinations (Transcribe, Transcribed Files, Provider) --
  see `src/components/navItems.ts`/`navIcons.tsx` (small inline SVGs, no
  icon library) and `AppShell.tsx`.
- **Job detail is normally a modal**, opened from a Transcribed Files row
  (`src/components/JobDetailModal.tsx`), built on the native `<dialog>` +
  `.showModal()` (real focus trap, Escape-to-close, inert background, all
  from the platform -- no modal library, no hand-rolled trap). Focus
  restoration on close is explicit and deterministic
  (`src/hooks/useJobDetailModal.ts`), not reliant on the browser's own
  implicit restore-on-close behavior: it records the exact triggering row
  element on open and restores focus to it on close (button, Escape/cancel,
  or any programmatic close all funnel through the same single close path),
  falling back to a stable page heading if that row is no longer in the DOM.
  The modal and the `/jobs/[jobId]` fallback route both render the same
  `src/components/JobStatusDetail.tsx` -- no forked status/result logic.
- **Transcribed Files pagination:** "Load more" over the existing
  `limit`/`offset` API (no new API, no infinite scroll). The ~5s active-job
  polling refreshes only the first page and merges it in -- appended
  ("Load more") history is never reset/duplicated. A **per-job
  out-of-page tracker** additionally keeps any loaded `QUEUED`/`PROCESSING`
  job individually live via `GET /api/jobs/:jobId` even once it's been
  paginated off the first page (enrolled the moment it enters the loaded
  set, e.g. right after "Load more" reveals it -- not only on the next
  first-page event), stopping once it reaches a terminal status or is
  covered by a first-page refresh again. See `src/hooks/useJobsPolling.ts`.
- Live status updates are client-side interval polling only, paused while
  the tab is hidden and refreshed immediately on return -- no
  SSE/WebSockets/new push infrastructure.
- The completed-job transcript experience is Read (inline, in
  `src/components/TranscriptReader.tsx`) + Copy (Clipboard API) + Download
  PDF -- there is no user-facing `.txt` download button; the existing
  `text/plain` `/result` endpoint remains the API's canonical transcript
  source, just not a user-facing download link.
- **Provider page (`/provider`, `src/components/ProviderSettings.tsx`):**
  the OpenAI API card's Configure/Replace open a native `<dialog>`
  (`src/components/OpenAICredentialModal.tsx`) and Remove asks for inline
  confirmation; all of them go through `/api/provider/openai`, and every
  displayed state comes from that route's safe status response (never a
  raw key). An `OPENAI_API_KEY` set in the server environment always wins
  and is shown as locked. The "Connected accounts" section is
  presentation-only.
- **PDF export** (`src/lib/pdf/generateTranscriptPdf.ts`, `app/api/jobs/[jobId]/result/pdf/route.ts`):
  generated on demand with `pdfkit`, streamed straight into the HTTP
  response, never written to `DATA_DIR`. Embeds a vendored Noto Sans
  Regular font (`src/lib/pdf/fonts/`, SIL OFL-1.1, see that directory's own
  `README.md` for provenance) for Unicode support -- verified for Latin
  Extended/Cyrillic/Greek (including Swedish `å ä ö`), **not** CJK or RTL
  scripts in v1. Before rendering, the transcript's characters are checked
  against the embedded font's actual glyph coverage (via `fontkit`, an
  explicit direct dependency pinned to the same version `pdfkit` itself
  uses, so npm dedupes to one copy); an unsupported character produces a
  clear `422` error instead of a PDF with missing-glyph boxes. The client
  ("Download PDF") never uses a plain `<a href>` link -- it drives its own
  fetch → check-`ok` → Blob → object-URL → download flow
  (`src/hooks/useDownloadTranscriptPdf.ts`) so it can show
  generating/error/retry states.

## Interaction with `packages/db`

Everything DB-shaped reuses `packages/db` directly: `openDb`, `jobs`,
`jobDocumentToRow`, `rowToJobDocument`, and the `DATA_DIR` path-safety
helpers (`resolveWithinDataDir`, `buildUploadRelativePath`,
`sanitizeFilenameSegment`, etc.). No new persistence or contract-validation
layer was introduced (no separate validation/schema library is used).

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
- `npm test` -- Vitest suite: unit tests for validation/parsing/PDF-generation
  logic, route-handler tests calling the exported `GET`/`POST` functions
  directly against a real temporary `DATA_DIR`, and component/hook/
  page tests. Component/hook/page tests opt into a `jsdom` environment
  individually via a `// @vitest-environment jsdom` docblock
  (`tests/components/`, `tests/hooks/`, `tests/pages/`) -- the lib/route
  tests keep running in the default Node environment. `@testing-library/react`, `@testing-library/jest-dom`, and
  `@testing-library/user-event` are dev-only, jsdom-only dependencies; no
  Playwright/Cypress/Storybook. `tests/setup/jsdomSetup.ts` also carries a
  small test-only polyfill for `HTMLDialogElement`'s `showModal`/`show`/
  `close` (jsdom implements the `open` attribute but none of these methods
  as of the jsdom version this project uses) -- real browsers all implement
  them natively, so this only affects the test environment.
- `npm run typecheck` -- `tsc --noEmit`.
