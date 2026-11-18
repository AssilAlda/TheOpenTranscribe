"""Subprocess entrypoint for the TypeScript runner (packages/runner).

Not the standalone CLI (see cli.py) — cli.py's user-facing behavior,
language choices, and output-file placement are intentionally left untouched
by this module. This is a separate, narrow adapter: explicit input path in,
explicit output path out, an unrestricted language string, and a reliable
exit code, so an external caller doesn't have to parse human-readable CLI
output to know whether transcription succeeded.

Reuses the existing transcription engine (transcribe_media, OpenAIProvider)
rather than reimplementing transcription.
"""

import argparse
import os
import sys
import tempfile
from pathlib import Path

from .chunking import SUPPORTED_EXTENSIONS
from .cli import transcribe_media
from .providers.openai_provider import OpenAIProvider


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="theopentranscribe-run-job",
        description=(
            "Transcribe one media file to one explicit output path. "
            "Internal subprocess entrypoint for the job runner; not for direct end-user use."
        ),
    )
    parser.add_argument("--input", required=True, help="Absolute path to the input media file.")
    parser.add_argument("--output", required=True, help="Absolute path to write the transcript to.")
    parser.add_argument(
        "--language",
        default=None,
        help="Optional non-empty language string, forwarded as-is to the provider.",
    )
    return parser.parse_args(argv)


def _write_output_atomically(text: str, output_path: Path) -> None:
    """Writes the transcript so a reader (or the runner marking this job
    COMPLETED) never observes a partial file: content is written to a
    temporary file in the same directory as `output_path` (so the final
    `os.replace` is an atomic same-filesystem rename, not a copy), then
    swapped into place only once the write has fully succeeded. The temp
    file is removed on any failure, including one that happens mid-write.
    Does not touch cli.save_text — that remains the standalone CLI's own
    (non-atomic) behavior, unchanged.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_path_str = tempfile.mkstemp(
        dir=output_path.parent, prefix=f".{output_path.name}.", suffix=".tmp"
    )
    tmp_path = Path(tmp_path_str)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text.strip() + "\n")
        os.replace(tmp_path, output_path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def _safe_failure_message(exc: BaseException) -> str:
    """A safe, non-secret diagnostic for an unexpected transcription failure.

    Secret redaction: never stringify the raw exception directly. A provider
    SDK exception's own `str(exc)` can embed request/response details (e.g.
    headers, request bodies) this module has no way to fully audit for secret
    material — so only the exception's type name and, when present as a plain
    safe attribute (common on httpx/openai SDK exceptions), its HTTP status
    code are surfaced. Both are safe, non-secret diagnostic categories on
    their own. This text reaches the runner's stderr capture, which applies
    its own centralized redaction as a further backstop
    (packages/runner/src/spawnCapture.ts) — this is the first, source-level
    layer, not the only one.
    """
    exc_type = type(exc).__name__
    status_code = getattr(exc, "status_code", None)
    if status_code is not None:
        return f"Transcription failed: {exc_type} (status {status_code})"
    return f"Transcription failed: {exc_type}"


def run(input_path: Path, output_path: Path, language: str | None) -> int:
    if not os.getenv("OPENAI_API_KEY"):
        print("OPENAI_API_KEY is not set.", file=sys.stderr)
        return 1

    if not input_path.is_file():
        print(f"Input file does not exist: {input_path}", file=sys.stderr)
        return 1

    if input_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
        print(f"Unsupported media extension: {input_path.suffix}", file=sys.stderr)
        return 1

    normalized_language = language.strip() if language and language.strip() else None

    try:
        provider = OpenAIProvider()
        text = transcribe_media(input_path, normalized_language, provider)
        _write_output_atomically(text, output_path)
    except Exception as exc:  # noqa: BLE001 - single top-level failure boundary by design
        print(_safe_failure_message(exc), file=sys.stderr)
        return 1

    return 0


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    return run(Path(args.input), Path(args.output), args.language)


if __name__ == "__main__":
    sys.exit(main())
