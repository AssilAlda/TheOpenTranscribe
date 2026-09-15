# TheOpenTranscribe

TheOpenTranscribe is an open source transcription application with both a
CLI and a web dashboard. Users can self-host it, provide their own
transcription provider API key, upload media, run transcriptions, and
manage their transcription history through the dashboard.

This repository is currently in its first phase: a standalone, tested CLI.
The web dashboard, background job runner, and persistence layer described
in the project's architecture plan arrive in later phases.

## Status

- ✅ CLI transcription engine (`packages/transcriber`)
- ✅ JSON job contract (`packages/contract`) — shared shape for job state between the future web app and runner
- ⏳ Web dashboard, job runner, persistence — not yet built

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

## License

MIT — see [`LICENSE`](LICENSE).
