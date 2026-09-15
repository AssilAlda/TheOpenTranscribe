import math
import subprocess
from pathlib import Path

CHUNK_SECONDS = 8 * 60
CHUNK_OVERLAP_SECONDS = 3

SUPPORTED_EXTENSIONS = {".mp4", ".mov", ".m4a", ".mp3", ".wav"}


def find_media_files(path: Path) -> list[Path]:
    if path.is_file():
        return [path] if path.suffix.lower() in SUPPORTED_EXTENSIONS else []

    return sorted(
        file_path
        for file_path in path.iterdir()
        if file_path.is_file()
        and not file_path.name.startswith(".")
        and file_path.suffix.lower() in SUPPORTED_EXTENSIONS
    )


def get_audio_duration_seconds(media_path: Path) -> float:
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(media_path),
    ]
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    return float(result.stdout.strip())


def extract_audio_chunks(media_path: Path, chunks_dir: Path) -> list[Path]:
    duration = get_audio_duration_seconds(media_path)
    step_seconds = CHUNK_SECONDS - CHUNK_OVERLAP_SECONDS
    chunk_count = max(1, math.ceil(duration / step_seconds))

    chunks: list[Path] = []
    for index in range(chunk_count):
        start_seconds = index * step_seconds
        if start_seconds >= duration:
            break

        chunk_path = chunks_dir / f"chunk_{index:03d}.wav"
        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(start_seconds),
            "-i", str(media_path),
            "-t", str(CHUNK_SECONDS),
            "-vn",
            "-ac", "1",
            "-ar", "16000",
            "-c:a", "pcm_s16le",
            str(chunk_path),
        ]
        subprocess.run(cmd, check=True)
        chunks.append(chunk_path)

    if not chunks:
        raise RuntimeError("Kunde inte skapa ljudsegment med ffmpeg.")

    return chunks
