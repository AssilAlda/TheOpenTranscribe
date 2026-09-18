# TheOpenTranscribe

TheOpenTranscribe is an open source transcription application with both a
CLI and a web dashboard. Users can self-host it, provide their own
transcription provider API key, upload media, run transcriptions, and
manage their transcription history through the dashboard.

The CLI, job contract, local SQLite persistence, a lightweight background job
runner, the web API, the dashboard, and credential/settings management are
all built, and the whole system can be self-hosted with Docker.

## Status

- ✅ CLI transcription engine (`packages/transcriber`)
- ✅ JSON job contract (`packages/contract`) — shared shape for job state between the web app and runner
- ✅ SQLite / `DATA_DIR` persistence (`packages/db`)
- ✅ Lightweight background job runner (`packages/runner`)
- ✅ Web API + dashboard (`packages/web`) — upload, job history, per-job status/detail, transcript reading/copy/PDF export
- ✅ Credential/settings management (`packages/provider-config`) — configure/replace/remove your provider API key from the dashboard
- ✅ Docker / CI / release readiness — `docker compose up` self-hosting, CI across all packages

## Prerequisites

- Python 3.13 or newer
- [`ffmpeg`](https://ffmpeg.org/) and `ffprobe` available on `PATH`
- An OpenAI API key (see `.env.example`)

## Quick start

```bash
cd packages/transcriber
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

cp ../../.env.example ../../.env
# edit ../../.env and set OPENAI_API_KEY

theopentranscribe path/to/file.mp4 --language sv
```

See [`packages/transcriber/README.md`](packages/transcriber/README.md) for
full CLI usage and testing instructions.

To run the web dashboard + API instead, see
[`packages/web/README.md`](packages/web/README.md) (needs `packages/db` and,
to actually process jobs, `packages/runner` — see their own READMEs). All
three share a `DATA_DIR` environment variable pointing at a local directory
for the SQLite database and managed uploads/outputs.

## Self-hosting with Docker

The easiest way to run the whole system (dashboard + background runner) is
Docker Compose:

```bash
cp .env.example .env
# edit .env: OPENAI_API_KEY is optional (you can instead configure a key
# from the dashboard's Provider settings page after starting the stack)

docker compose up -d --build
```

Then open `http://localhost:3000`.

This starts two containers:

- **`web`** — the Next.js dashboard + API.
- **`runner`** — the background job runner, bundled with a Python 3.13
  environment and `ffmpeg` (the runner invokes the transcriber as a
  subprocess, not over the network, so both must live in one container).

and two named volumes, both required and independent of each other:

- **`data_dir`** — the SQLite database, uploaded media, and transcript
  outputs (`DATA_DIR`).
- **`config_dir`** — your managed provider credential, if you configure one
  from the dashboard instead of via `OPENAI_API_KEY`
  (`THEOPENTRANSCRIBE_CONFIG_DIR`). This file is stored in **plaintext** on
  that volume (filesystem permissions are its only protection) — back it up
  and restrict host access to it accordingly, the same as you would any
  other file containing an API key.

**Do not scale the `runner` service** (e.g. `docker compose up --scale
runner=2`), and don't point two separate `docker compose` projects at the
same `data_dir` volume. Exactly one runner process per `DATA_DIR` is a hard
requirement — the runner's startup recovery sweep can't distinguish an
orphaned job from one a second, genuinely active runner is still working on.

By default the dashboard is only reachable from the machine (or LAN, if you
publish the port) that can reach `http://localhost:3000` — see
`THEOPENTRANSCRIBE_TRUSTED_ORIGINS` in `.env.example` if you need to reach it
via a LAN IP or custom hostname instead of `localhost`. That setting is
CSRF/origin protection only, not authentication: exposing this app to the
public internet is **not** made secure by Docker or by that setting alone —
put a reverse proxy, VPN, or other access-control layer in front of it first
if you need that.

## License

MIT — see [`LICENSE`](LICENSE).
