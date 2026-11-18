from pathlib import Path

import pytest

from transcriber import cli


class FakeProvider:
    """Stub provider: yields the next configured result per .transcribe() call.

    Each entry in `results` is either a string (a successful transcript) or
    an Exception instance (raised on that attempt).
    """

    def __init__(self, results):
        self._results = list(results)
        self.calls = []

    def transcribe(self, audio_path, language):
        self.calls.append((audio_path, language))
        result = self._results.pop(0)
        if isinstance(result, Exception):
            raise result
        return result


def _patch_sleep(monkeypatch):
    sleep_calls = []
    monkeypatch.setattr(cli.time, "sleep", lambda seconds: sleep_calls.append(seconds))
    return sleep_calls


def test_succeeds_on_first_attempt_with_no_sleep(monkeypatch):
    sleep_calls = _patch_sleep(monkeypatch)
    provider = FakeProvider(["hej och välkommen"])

    result = cli.transcribe_audio_chunks([Path("chunk_000.wav")], None, provider)

    assert result == "hej och välkommen"
    assert len(provider.calls) == 1
    assert sleep_calls == []


def test_succeeds_on_second_attempt_after_one_two_second_sleep(monkeypatch):
    sleep_calls = _patch_sleep(monkeypatch)
    provider = FakeProvider([RuntimeError("temporary failure"), "hej"])

    result = cli.transcribe_audio_chunks([Path("chunk_000.wav")], None, provider)

    assert result == "hej"
    assert len(provider.calls) == 2
    assert sleep_calls == [2]


def test_succeeds_on_third_attempt_after_two_and_four_second_sleeps(monkeypatch):
    sleep_calls = _patch_sleep(monkeypatch)
    provider = FakeProvider([RuntimeError("first failure"), RuntimeError("second failure"), "hej"])

    result = cli.transcribe_audio_chunks([Path("chunk_000.wav")], None, provider)

    assert result == "hej"
    assert len(provider.calls) == 3
    assert sleep_calls == [2, 4]


def test_exhausting_all_three_attempts_raises_without_a_third_sleep(monkeypatch):
    # Regression test for the exact original semantics (verified directly against
    # transkribera.py): exactly 3 total attempts, exactly two backoff sleeps
    # (2s, then 4s) — the third failure raises immediately with no 8s sleep and
    # no fourth attempt.
    sleep_calls = _patch_sleep(monkeypatch)
    provider = FakeProvider(
        [RuntimeError("first failure"), RuntimeError("second failure"), RuntimeError("third failure")]
    )

    with pytest.raises(RuntimeError) as excinfo:
        cli.transcribe_audio_chunks([Path("chunk_000.wav")], None, provider)

    assert len(provider.calls) == 3
    assert sleep_calls == [2, 4]
    assert "after 3 attempts" in str(excinfo.value)
    assert excinfo.value.__cause__ is not None


def test_language_is_forwarded_to_the_provider(monkeypatch):
    _patch_sleep(monkeypatch)
    provider = FakeProvider(["hej"])

    cli.transcribe_audio_chunks([Path("chunk_000.wav")], "sv", provider)

    assert provider.calls == [(Path("chunk_000.wav"), "sv")]


def test_multiple_chunks_are_transcribed_in_order_and_merged(monkeypatch):
    _patch_sleep(monkeypatch)
    provider = FakeProvider(["första delen", "andra delen"])

    result = cli.transcribe_audio_chunks(
        [Path("chunk_000.wav"), Path("chunk_001.wav")], None, provider
    )

    assert result == "första delen\n\nandra delen"
    assert [audio_path for audio_path, _ in provider.calls] == [
        Path("chunk_000.wav"),
        Path("chunk_001.wav"),
    ]
