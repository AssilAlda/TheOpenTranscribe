import sys
import os
import argparse
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

if load_dotenv is not None:
    load_dotenv()

from .chunking import SUPPORTED_EXTENSIONS, find_media_files, extract_audio_chunks
from .merge import clean_transcript, merge_transcript_parts
from .providers.openai_provider import OpenAIProvider

MAX_TRANSCRIBE_RETRIES = 3
INITIAL_RETRY_DELAY_SECONDS = 2
SUPPORTED_FORMATS = ", ".join(sorted(SUPPORTED_EXTENSIONS))


def transcribe_audio_chunks(
    audio_chunks: list[Path], language: Optional[str], provider: OpenAIProvider
) -> str:
    parts: list[str] = []

    for index, audio_path in enumerate(audio_chunks, start=1):
        print(f"Transcribing part {index}/{len(audio_chunks)}...")

        transcript_text = None
        for attempt in range(1, MAX_TRANSCRIBE_RETRIES + 1):
            try:
                transcript_text = provider.transcribe(audio_path, language)
                break
            except Exception as exc:
                if attempt == MAX_TRANSCRIBE_RETRIES:
                    raise RuntimeError(
                        f"Transcription failed for part {index}/{len(audio_chunks)} after {MAX_TRANSCRIBE_RETRIES} attempts."
                    ) from exc

                delay_seconds = INITIAL_RETRY_DELAY_SECONDS * (2 ** (attempt - 1))
                print(
                    f"Warning: part {index} failed (attempt {attempt}/{MAX_TRANSCRIBE_RETRIES}). "
                    f"Retrying in {delay_seconds} seconds...",
                    file=sys.stderr,
                )
                time.sleep(delay_seconds)

        if transcript_text is None:
            raise RuntimeError(f"Could not transcribe part {index}/{len(audio_chunks)}.")

        parts.append(clean_transcript(transcript_text))

    return merge_transcript_parts(parts)


def save_text(text: str, output_path: Path) -> None:
    output_path.write_text(text.strip() + "\n", encoding="utf-8")


def save_combined_text(transcriptions: list[tuple[str, str]], output_path: Path) -> None:
    sections: list[str] = []

    for title, text in transcriptions:
        sections.append(f"{title}\n{'=' * len(title)}\n{text.strip()}")

    output_path.write_text("\n\n".join(sections).strip() + "\n", encoding="utf-8")


def transcribe_media(media_path: Path, language: Optional[str], provider: OpenAIProvider) -> str:
    with tempfile.TemporaryDirectory(prefix="theopentranscribe_chunks_") as tmp_dir:
        chunks_dir = Path(tmp_dir)

        print(f"Extracting and splitting audio: {media_path.name}")
        audio_chunks = extract_audio_chunks(media_path, chunks_dir)

        print(f"Transcribing: {media_path.name}")
        return transcribe_audio_chunks(audio_chunks, language, provider)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="theopentranscribe",
        description=f"Transcribe a media file, or every media file in a folder. Supported formats: {SUPPORTED_FORMATS}.",
    )
    parser.add_argument(
        "input_path",
        help="Path to a media file, or to a folder of media files (not searched recursively).",
    )
    parser.add_argument(
        "--language",
        choices=["sv", "en"],
        default=None,
        help="Force the spoken language. Leave out for automatic detection.",
    )
    return parser.parse_args()


def fail(message: str) -> None:
    print(f"Error: {message}", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    args = parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        fail("OPENAI_API_KEY is not set. Set the environment variable or add it to a .env file.")

    input_path = Path(args.input_path).expanduser().resolve()

    if not input_path.exists():
        fail(f"File or folder not found: {input_path}")

    provider = OpenAIProvider()

    try:
        media_files = find_media_files(input_path)
        if not media_files:
            fail(f"No supported media files found. Supported formats: {SUPPORTED_FORMATS}.")

        combined_transcriptions: list[tuple[str, str]] = []

        for index, media_path in enumerate(media_files, start=1):
            print(f"Processing file {index}/{len(media_files)}: {media_path.name}")
            text = transcribe_media(media_path, args.language, provider)

            output_path = media_path.with_suffix(".txt")
            print(f"Saved transcript: {output_path.name}")
            save_text(text, output_path)

            combined_transcriptions.append((media_path.stem, text))

        # A folder also gets one document with every transcript combined.
        if input_path.is_dir():
            combined_output_path = input_path / f"{input_path.name}.txt"
            save_combined_text(combined_transcriptions, combined_output_path)
            print(f"Saved combined transcript: {combined_output_path.name}")

        print("Done!")

    except FileNotFoundError as e:
        fail(f"Could not find the program {e.filename}. Install ffmpeg first.")

    except subprocess.CalledProcessError:
        fail("ffmpeg or ffprobe did not run correctly.")

    except Exception as e:
        fail(str(e))


if __name__ == "__main__":
    main()
