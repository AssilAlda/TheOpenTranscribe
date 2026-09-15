from pathlib import Path
from typing import Optional

from openai import OpenAI

DEFAULT_MODEL = "gpt-4o-transcribe"


class OpenAIProvider:
    """Performs a single transcription API call against OpenAI.

    Retry/backoff is deliberately not handled here so the policy stays
    provider-agnostic — see cli.transcribe_audio_chunks.
    """

    def __init__(self, model: str = DEFAULT_MODEL):
        self.model = model
        self._client: Optional[OpenAI] = None

    @property
    def client(self) -> OpenAI:
        if self._client is None:
            self._client = OpenAI()
        return self._client

    def transcribe(self, audio_path: Path, language: Optional[str]) -> str:
        with audio_path.open("rb") as f:
            request_kwargs = {
                "model": self.model,
                "file": f,
            }
            if language:
                request_kwargs["language"] = language

            transcript = self.client.audio.transcriptions.create(**request_kwargs)

        return transcript.text
