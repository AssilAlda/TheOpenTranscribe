import pytest

from transcriber import chunking
from transcriber.chunking import (
    CHUNK_SECONDS,
    CHUNK_OVERLAP_SECONDS,
    SUPPORTED_EXTENSIONS,
    extract_audio_chunks,
    find_media_files,
)

STEP_SECONDS = 477  # CHUNK_SECONDS - CHUNK_OVERLAP_SECONDS


def _fake_run_recording(calls):
    def fake_run(cmd, **kwargs):
        calls.append(cmd)
        return None

    return fake_run


def _ss_values(calls):
    values = []
    for cmd in calls:
        index = cmd.index("-ss")
        values.append(cmd[index + 1])
    return values


def _run_extract_with_duration(monkeypatch, tmp_path, duration_seconds):
    monkeypatch.setattr(chunking, "get_audio_duration_seconds", lambda media_path: duration_seconds)
    calls: list[list[str]] = []
    monkeypatch.setattr(chunking.subprocess, "run", _fake_run_recording(calls))

    media_path = tmp_path / "sample.mp4"
    chunks_dir = tmp_path / "chunks"

    chunks = extract_audio_chunks(media_path, chunks_dir)
    return chunks, calls


def test_step_seconds_constant():
    assert CHUNK_SECONDS - CHUNK_OVERLAP_SECONDS == STEP_SECONDS


def test_short_media_produces_one_chunk(monkeypatch, tmp_path):
    chunks, calls = _run_extract_with_duration(monkeypatch, tmp_path, duration_seconds=30)

    assert len(chunks) == 1
    assert len(calls) == 1
    assert _ss_values(calls) == ["0"]


def test_duration_just_over_one_step_produces_two_chunks(monkeypatch, tmp_path):
    chunks, calls = _run_extract_with_duration(
        monkeypatch, tmp_path, duration_seconds=STEP_SECONDS + 1
    )

    assert len(chunks) == 2
    assert _ss_values(calls) == ["0", str(STEP_SECONDS)]


def test_exact_multiple_of_step_produces_expected_chunk_count(monkeypatch, tmp_path):
    duration = STEP_SECONDS * 3
    chunks, calls = _run_extract_with_duration(monkeypatch, tmp_path, duration_seconds=duration)

    assert len(chunks) == 3
    assert _ss_values(calls) == ["0", str(STEP_SECONDS), str(STEP_SECONDS * 2)]


def test_chunk_starts_are_separated_by_exactly_the_step_seconds(monkeypatch, tmp_path):
    duration = STEP_SECONDS * 3
    _chunks, calls = _run_extract_with_duration(monkeypatch, tmp_path, duration_seconds=duration)

    starts = [int(value) for value in _ss_values(calls)]
    diffs = [second - first for first, second in zip(starts, starts[1:])]

    assert diffs == [STEP_SECONDS, STEP_SECONDS]


def test_zero_duration_raises_and_creates_no_chunks(monkeypatch, tmp_path):
    # With duration == 0, chunk_count == max(1, ceil(0 / STEP_SECONDS)) == 1, but the
    # loop's own `start_seconds >= duration` guard (0 >= 0) breaks immediately before
    # any chunk is created, so extract_audio_chunks raises RuntimeError. This is the
    # real current behavior of the production function, not invented behavior.
    monkeypatch.setattr(chunking, "get_audio_duration_seconds", lambda media_path: 0)
    calls: list[list[str]] = []
    monkeypatch.setattr(chunking.subprocess, "run", _fake_run_recording(calls))

    media_path = tmp_path / "sample.mp4"
    chunks_dir = tmp_path / "chunks"

    with pytest.raises(RuntimeError):
        extract_audio_chunks(media_path, chunks_dir)

    assert calls == []


def test_supported_extensions_unchanged():
    assert SUPPORTED_EXTENSIONS == {".mp4", ".mov", ".m4a", ".mp3", ".wav"}


def test_find_media_files_filters_by_extension_and_skips_dotfiles(tmp_path):
    (tmp_path / "lecture.mp4").write_bytes(b"")
    (tmp_path / "notes.txt").write_bytes(b"")
    (tmp_path / ".hidden.mp3").write_bytes(b"")
    (tmp_path / "interview.WAV").write_bytes(b"")

    found_names = sorted(p.name for p in find_media_files(tmp_path))

    assert found_names == ["interview.WAV", "lecture.mp4"]


def test_find_media_files_returns_single_file_when_given_a_file(tmp_path):
    media_file = tmp_path / "clip.m4a"
    media_file.write_bytes(b"")

    assert find_media_files(media_file) == [media_file]


def test_find_media_files_rejects_unsupported_single_file(tmp_path):
    other_file = tmp_path / "clip.pdf"
    other_file.write_bytes(b"")

    assert find_media_files(other_file) == []
