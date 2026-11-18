# theopentranscribe (CLI)

Part of [TheOpenTranscribe](../../README.md).

The Python transcription engine, also usable on its own as a command-line tool. Splits media into chunks with ffmpeg, transcribes them with OpenAI's `gpt-4o-transcribe`, and stitches the result back together.

### Installation

Requires Python 3.13+ and `ffmpeg` / `ffprobe` on your `PATH`.

```bash
cd packages/transcriber
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
```

Set your API key in the environment, or in a `.env` file in the folder you run it from:

```bash
export OPENAI_API_KEY=sk-...
```

### Usage

```bash
theopentranscribe recording.mp4                 # one file
theopentranscribe recording.mp4 --language sv   # force a language (sv or en)
theopentranscribe ./interviews                  # every supported file in a folder
```

| Input | Output |
|---|---|
| A file | `recording.txt` next to the file |
| A folder | One `.txt` per file, plus `<folder>.txt` with all transcripts combined |

Supported formats: `.mp4` `.mov` `.m4a` `.mp3` `.wav` `.mpeg` `.mpga` `.webm`. Folders are not searched recursively. Leave out `--language` for automatic detection.

### How the app uses it

The background runner calls `python -m transcriber.run_job` for each job. That entrypoint is internal and not meant to be run by hand.

### Tests

```bash
pytest
```
