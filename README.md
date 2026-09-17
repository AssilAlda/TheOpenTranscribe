# TheOpenTranscribe

TheOpenTranscribe is an open source transcription application with both a
CLI and a web dashboard. Users can self-host it, provide their own
transcription provider API key, upload media, run transcriptions, and
manage their transcription history through the dashboard.

The CLI, job contract, local SQLite persistence, a lightweight background job
runner, the web API, and the dashboard are built. Credential/settings
management described in the project's architecture plan arrives in a later
phase.

## Status

- ✅ CLI transcription engine (`packages/transcriber`)
- ✅ JSON job contract (`packages/contract`) — shared shape for job state between the web app and runner
- ✅ SQLite / `DATA_DIR` persistence (`packages/db`)
- ✅ Lightweight background job runner (`packages/runner`)
- ✅ Web API + dashboard (`packages/web`) — upload, job history, per-job status/detail, transcript reading/copy/PDF export
- ⏳ Credential/settings management — not yet built

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

## License

MIT — see [`LICENSE`](LICENSE).
