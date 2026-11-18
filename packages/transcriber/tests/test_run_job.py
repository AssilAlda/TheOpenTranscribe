from pathlib import Path

import pytest

from transcriber import run_job


class FakeProvider:
    def __init__(self):
        self.calls = []

    def transcribe(self, audio_path, language):
        self.calls.append((audio_path, language))
        return "fake transcript text"


@pytest.fixture(autouse=True)
def api_key(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")


def _media_file(tmp_path: Path, name: str = "input.mp3") -> Path:
    media_path = tmp_path / name
    media_path.write_bytes(b"fake audio bytes")
    return media_path


def test_returns_1_when_api_key_missing(monkeypatch, tmp_path):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    input_path = _media_file(tmp_path)
    output_path = tmp_path / "out.txt"

    exit_code = run_job.run(input_path, output_path, None)

    assert exit_code == 1
    assert not output_path.exists()


def test_returns_1_when_input_file_missing(tmp_path):
    exit_code = run_job.run(tmp_path / "missing.mp3", tmp_path / "out.txt", None)

    assert exit_code == 1


def test_returns_1_for_unsupported_extension(tmp_path):
    input_path = _media_file(tmp_path, "input.txt")
    exit_code = run_job.run(input_path, tmp_path / "out.txt", None)

    assert exit_code == 1


def test_successful_transcription_writes_output_and_returns_0(monkeypatch, tmp_path):
    fake_provider = FakeProvider()
    monkeypatch.setattr(run_job, "OpenAIProvider", lambda: fake_provider)
    monkeypatch.setattr(
        run_job,
        "transcribe_media",
        lambda media_path, language, provider: provider.transcribe(media_path, language),
    )

    input_path = _media_file(tmp_path)
    output_path = tmp_path / "nested" / "out.txt"

    exit_code = run_job.run(input_path, output_path, None)

    assert exit_code == 0
    assert output_path.read_text(encoding="utf-8") == "fake transcript text\n"


def test_arbitrary_language_string_is_forwarded_unmodified(monkeypatch, tmp_path):
    fake_provider = FakeProvider()
    monkeypatch.setattr(run_job, "OpenAIProvider", lambda: fake_provider)

    captured = {}

    def fake_transcribe_media(media_path, language, provider):
        captured["language"] = language
        return provider.transcribe(media_path, language)

    monkeypatch.setattr(run_job, "transcribe_media", fake_transcribe_media)

    input_path = _media_file(tmp_path)
    exit_code = run_job.run(input_path, tmp_path / "out.txt", "de")

    assert exit_code == 0
    assert captured["language"] == "de"
    assert fake_provider.calls[0][1] == "de"


def test_blank_language_is_normalized_to_none(monkeypatch, tmp_path):
    captured = {}

    def fake_transcribe_media(media_path, language, provider):
        captured["language"] = language
        return "text"

    monkeypatch.setattr(run_job, "OpenAIProvider", lambda: FakeProvider())
    monkeypatch.setattr(run_job, "transcribe_media", fake_transcribe_media)

    exit_code = run_job.run(_media_file(tmp_path), tmp_path / "out.txt", "   ")

    assert exit_code == 0
    assert captured["language"] is None


def test_transcription_failure_returns_1_and_does_not_write_output(monkeypatch, tmp_path):
    def failing_transcribe_media(media_path, language, provider):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(run_job, "OpenAIProvider", lambda: FakeProvider())
    monkeypatch.setattr(run_job, "transcribe_media", failing_transcribe_media)

    output_path = tmp_path / "out.txt"
    exit_code = run_job.run(_media_file(tmp_path), output_path, None)

    assert exit_code == 1
    assert not output_path.exists()


def test_successful_write_leaves_no_stray_temp_files(monkeypatch, tmp_path):
    monkeypatch.setattr(run_job, "OpenAIProvider", lambda: FakeProvider())
    monkeypatch.setattr(
        run_job,
        "transcribe_media",
        lambda media_path, language, provider: "fake transcript text",
    )

    output_path = tmp_path / "outputs" / "job1.txt"
    exit_code = run_job.run(_media_file(tmp_path), output_path, None)

    assert exit_code == 0
    assert sorted(p.name for p in output_path.parent.iterdir()) == ["job1.txt"]


def test_write_failure_leaves_no_partial_or_temp_output_file(monkeypatch, tmp_path):
    monkeypatch.setattr(run_job, "OpenAIProvider", lambda: FakeProvider())
    monkeypatch.setattr(
        run_job,
        "transcribe_media",
        lambda media_path, language, provider: "fake transcript text",
    )

    def failing_replace(src, dst):
        raise OSError("simulated disk failure during rename")

    monkeypatch.setattr(run_job.os, "replace", failing_replace)

    output_path = tmp_path / "outputs" / "job1.txt"
    exit_code = run_job.run(_media_file(tmp_path), output_path, None)

    assert exit_code == 1
    assert not output_path.exists()
    # The temp file created before the simulated failure must be cleaned up,
    # not left behind as clutter in the (locked) outputs/ layout.
    assert list(output_path.parent.iterdir()) == []


def test_write_output_atomically_cleans_up_temp_file_on_write_error(tmp_path):
    output_path = tmp_path / "out.txt"

    class ExplodingStr(str):
        def strip(self):
            raise RuntimeError("boom during write")

    with pytest.raises(RuntimeError, match="boom during write"):
        run_job._write_output_atomically(ExplodingStr("text"), output_path)

    assert not output_path.exists()
    assert list(tmp_path.iterdir()) == []


def test_parse_args_requires_input_and_output():
    args = run_job.parse_args(["--input", "/a/b.mp3", "--output", "/a/b.txt", "--language", "de"])

    assert args.input == "/a/b.mp3"
    assert args.output == "/a/b.txt"
    assert args.language == "de"


# Secret redaction: run_job.py must never print a raw stringified provider
# exception to stderr -- only a safe, non-secret diagnostic (exception type,
# and a status code when the exception exposes one as a plain attribute).


def test_safe_failure_message_omits_raw_exception_text():
    exc = RuntimeError("Authorization: Bearer sk-should-never-appear-anywhere")
    message = run_job._safe_failure_message(exc)

    assert "sk-should-never-appear-anywhere" not in message
    assert "Bearer" not in message
    assert "RuntimeError" in message


def test_safe_failure_message_includes_status_code_when_present():
    class FakeApiError(Exception):
        status_code = 429

    message = run_job._safe_failure_message(FakeApiError("rate limited, key sk-secret-value"))

    assert "sk-secret-value" not in message
    assert "429" in message
    assert "FakeApiError" in message


def test_run_failure_path_never_prints_raw_exception_text_to_stderr(monkeypatch, tmp_path, capsys):
    def failing_transcribe_media(media_path, language, provider):
        raise RuntimeError("upstream said: api_key=sk-leaked-value-should-not-appear")

    monkeypatch.setattr(run_job, "OpenAIProvider", lambda: FakeProvider())
    monkeypatch.setattr(run_job, "transcribe_media", failing_transcribe_media)

    exit_code = run_job.run(_media_file(tmp_path), tmp_path / "out.txt", None)
    captured = capsys.readouterr()

    assert exit_code == 1
    assert "sk-leaked-value-should-not-appear" not in captured.err
    assert "Transcription failed: RuntimeError" in captured.err
