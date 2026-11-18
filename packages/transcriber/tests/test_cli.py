import sys

import pytest

from transcriber import cli
from transcriber.chunking import SUPPORTED_EXTENSIONS


def run_cli(monkeypatch, *args):
    monkeypatch.setattr(sys, "argv", ["theopentranscribe", *args])
    with pytest.raises(SystemExit) as excinfo:
        cli.main()
    return excinfo.value.code


@pytest.fixture
def fake_transcription(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setattr(cli, "OpenAIProvider", lambda: object())
    monkeypatch.setattr(cli, "transcribe_media", lambda path, language, provider: f"text of {path.stem}")


def test_help_lists_every_supported_format(monkeypatch, capsys):
    assert run_cli(monkeypatch, "--help") == 0
    out = capsys.readouterr().out
    for extension in SUPPORTED_EXTENSIONS:
        assert extension in out


def test_missing_api_key_exits_with_error(monkeypatch, capsys, tmp_path):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert run_cli(monkeypatch, str(tmp_path)) == 1
    assert "OPENAI_API_KEY is not set" in capsys.readouterr().err


def test_missing_path_exits_with_error(monkeypatch, capsys, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    assert run_cli(monkeypatch, str(tmp_path / "nope.mp3")) == 1
    assert "File or folder not found" in capsys.readouterr().err


def test_folder_without_media_exits_with_error(monkeypatch, capsys, tmp_path, fake_transcription):
    (tmp_path / "notes.txt").write_text("hi")
    assert run_cli(monkeypatch, str(tmp_path)) == 1
    assert "No supported media files found" in capsys.readouterr().err


def test_transcription_failure_exits_with_error(monkeypatch, capsys, tmp_path, fake_transcription):
    media = tmp_path / "talk.mp3"
    media.write_bytes(b"x")

    def boom(*_args):
        raise RuntimeError("provider exploded")

    monkeypatch.setattr(cli, "transcribe_media", boom)
    assert run_cli(monkeypatch, str(media)) == 1
    assert "Error: provider exploded" in capsys.readouterr().err


def test_single_file_writes_only_its_own_transcript(monkeypatch, tmp_path, fake_transcription):
    media = tmp_path / "talk.mp3"
    media.write_bytes(b"x")

    monkeypatch.setattr(sys, "argv", ["theopentranscribe", str(media)])
    cli.main()

    assert (tmp_path / "talk.txt").read_text() == "text of talk\n"
    assert sorted(p.name for p in tmp_path.iterdir()) == ["talk.mp3", "talk.txt"]


def test_folder_also_writes_combined_transcript(monkeypatch, tmp_path, fake_transcription):
    folder = tmp_path / "interviews"
    folder.mkdir()
    (folder / "a.mp3").write_bytes(b"x")
    (folder / "b.wav").write_bytes(b"x")

    monkeypatch.setattr(sys, "argv", ["theopentranscribe", str(folder)])
    cli.main()

    assert (folder / "a.txt").exists() and (folder / "b.txt").exists()
    combined = (folder / "interviews.txt").read_text()
    assert "a\n=\ntext of a" in combined and "b\n=\ntext of b" in combined
