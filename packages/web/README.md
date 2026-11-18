# @theopentranscribe/web

Part of [TheOpenTranscribe](../../README.md).

The dashboard and HTTP API, in one Next.js app. It handles uploads, shows jobs and transcripts, exports PDFs and manages the API key. Transcription itself happens in the [runner](../runner).

### Setup

Install [`db`](../db) and [`provider-config`](../provider-config) first. This package depends on their build output.

```bash
cd packages/db && npm install
cd ../provider-config && npm install --include=dev && npm run build
cd ../web && npm install
```

### Running

```bash
DATA_DIR=/path/to/data npm run dev     # http://localhost:3000
```

Start the [runner](../runner) separately with the same `DATA_DIR`, or jobs stay on *Queued*.

| Variable | Required | Description |
|---|---|---|
| `DATA_DIR` | Yes | Same folder the runner uses. |
| `OPENAI_API_KEY` | No | Overrides the key saved on the Provider page. |
| `THEOPENTRANSCRIBE_CONFIG_DIR` | No | Where the saved key lives. See [`provider-config`](../provider-config). |
| `THEOPENTRANSCRIBE_TRUSTED_ORIGINS` | No | Extra origins allowed to upload and change settings, e.g. `http://192.168.1.50:3000`. Localhost is always allowed. |

### Pages

| Path | Page |
|---|---|
| `/` | **Upload files**: start a transcription |
| `/files` | **Transcribed files**: every job, live status, opens details in a modal |
| `/jobs/:jobId` | Job details as a full page, for direct links |
| `/provider` | **Provider**: add, replace or remove the OpenAI API key |

### API

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/jobs` | Upload a file (`multipart/form-data`: `file`, optional `language`). Returns `201` |
| `GET` | `/api/jobs` | Job history, newest first (`?limit=&offset=`) |
| `GET` | `/api/jobs/:jobId` | One job |
| `GET` | `/api/jobs/:jobId/result` | Transcript as plain text. `409` if not finished |
| `GET` | `/api/jobs/:jobId/result/pdf` | Transcript as PDF, generated on demand. `409` if not finished |
| `GET` | `/api/provider/openai` | Whether a key is configured and where it comes from, never the key itself |
| `POST` | `/api/provider/openai` | Validate and save a key |
| `DELETE` | `/api/provider/openai` | Remove the saved key |
| `GET` | `/api/health` | Health check |

JSON responses are `{ "data": … }` on success and `{ "error": { "code", "message" } }` on failure. Uploads and Provider changes require a trusted `Origin` header (CSRF protection).

### Uploads

- Allowed: `.mp3` `.mp4` `.mpeg` `.mpga` `.m4a` `.wav` `.webm`, up to 100 MB.
- The size limit is enforced while streaming, and the file contents are checked against the extension.
- Files are written to a temp name and only moved into place once everything checks out.

### Implementation notes

- **No UI libraries.** Design tokens in `app/globals.css` plus CSS Modules per component. Small inline SVG icons.
- **Native `<dialog>`** for modals, with focus restored to the row that opened it.
- **Live updates by polling** every ~5 s, paused while the tab is hidden. Active jobs stay live even after *Load more*.
- **PDF export** uses `pdfkit` with a bundled Noto Sans font ([details](src/lib/pdf/fonts/README.md)). Characters the font can't draw (CJK, right-to-left scripts) return a clear `422` instead of a broken PDF.

### Scripts

| Command | Description |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit, route and component tests (Vitest, jsdom for UI) |
| `npm run typecheck` | Type-check with `tsc` |
