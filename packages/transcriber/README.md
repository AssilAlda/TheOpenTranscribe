# TheOpenTranscribe Transcription Engine

The transcription engine and CLI for [TheOpenTranscribe](../../README.md).

## Install (development)

Requires Python 3.13 or newer, plus `ffmpeg` and `ffprobe` on `PATH`, and an
`OPENAI_API_KEY` (see the repository root `.env.example`).

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## Usage

```bash
theopentranscribe path/to/file.mp4 --language sv
```

`--language` accepts `sv` or `en`; omit it for automatic language detection.
Supported input types: `.mp4`, `.mov`, `.m4a`, `.mp3`, `.wav`. Passing a
folder processes every supported file in it (non-recursive) and also writes
one combined transcript for the folder.

## Tests

```bash
pytest
```
