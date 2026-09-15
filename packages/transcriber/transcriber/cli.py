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

from .chunking import find_media_files, extract_audio_chunks
from .merge import clean_transcript, merge_transcript_parts
from .providers.openai_provider import OpenAIProvider

MAX_TRANSCRIBE_RETRIES = 3
INITIAL_RETRY_DELAY_SECONDS = 2


def transcribe_audio_chunks(
    audio_chunks: list[Path], language: Optional[str], provider: OpenAIProvider
) -> str:
    parts: list[str] = []

    for index, audio_path in enumerate(audio_chunks, start=1):
        print(f"Transkriberar del {index}/{len(audio_chunks)}...")

        transcript_text = None
        for attempt in range(1, MAX_TRANSCRIBE_RETRIES + 1):
            try:
                transcript_text = provider.transcribe(audio_path, language)
                break
            except Exception as exc:
                if attempt == MAX_TRANSCRIBE_RETRIES:
                    raise RuntimeError(
                        f"Transkribering misslyckades för segment {index}/{len(audio_chunks)} efter {MAX_TRANSCRIBE_RETRIES} försök."
                    ) from exc

                delay_seconds = INITIAL_RETRY_DELAY_SECONDS * (2 ** (attempt - 1))
                print(
                    f"Varning: segment {index} misslyckades (försök {attempt}/{MAX_TRANSCRIBE_RETRIES}). "
                    f"Försöker igen om {delay_seconds} sekunder..."
                )
                time.sleep(delay_seconds)

        if transcript_text is None:
            raise RuntimeError(f"Kunde inte transkribera segment {index}/{len(audio_chunks)}.")

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

        print(f"Extraherar och delar upp ljud: {media_path.name}")
        audio_chunks = extract_audio_chunks(media_path, chunks_dir)

        print(f"Transkriberar: {media_path.name}")
        return transcribe_audio_chunks(audio_chunks, language, provider)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="theopentranscribe",
        description="Transkribera en mediafil eller en mapp med mediafiler (.mp4, .mov, .m4a, .mp3, .wav).",
    )
    parser.add_argument(
        "input_path",
        help="Sökväg till mediafil eller mapp med mp4, mov, m4a, mp3 eller wav.",
    )
    parser.add_argument(
        "--language",
        choices=["sv", "en"],
        default=None,
        help="Tvinga språk. Utelämna för automatisk språkdetektering.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    if not os.getenv("OPENAI_API_KEY"):
        print("Fel: OPENAI_API_KEY saknas. Sätt miljövariabeln eller lägg den i en .env-fil.")
        sys.exit(1)

    input_path = Path(args.input_path).expanduser().resolve()

    if not input_path.exists():
        print(f"Filen eller mappen finns inte: {input_path}")
        sys.exit(1)

    provider = OpenAIProvider()

    try:
        media_files = find_media_files(input_path)
        if not media_files:
            print("Ingen stödd mediafil hittades. Stöd finns för .mp4, .mov, .m4a, .mp3 och .wav.")
            sys.exit(1)

        combined_transcriptions: list[tuple[str, str]] = []

        for index, media_path in enumerate(media_files, start=1):
            print(f"Bearbetar mediafil {index}/{len(media_files)}: {media_path.name}")
            text = transcribe_media(media_path, args.language, provider)

            output_path = media_path.with_suffix(".txt")
            print(f"Sparar separat textfil: {output_path.name}")
            save_text(text, output_path)

            combined_transcriptions.append((media_path.stem, text))

        combined_output_path = (
            input_path / f"{input_path.name}.txt"
            if input_path.is_dir()
            else input_path.with_name(f"{input_path.stem}_alla_transkriberingar.txt")
        )

        print(f"Sparar samlat dokument: {combined_output_path.name}")
        save_combined_text(combined_transcriptions, combined_output_path)

        print("Klart!")

    except FileNotFoundError as e:
        print(f"Fel: kunde inte hitta programmet {e.filename}. Installera ffmpeg först.")

    except subprocess.CalledProcessError:
        print("Fel: ffmpeg eller ffprobe kunde inte köras korrekt.")

    except Exception as e:
        print("Fel:", e)


if __name__ == "__main__":
    main()
