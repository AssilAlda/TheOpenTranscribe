"""Job document contract shared between the future web application and runner.

This module is intentionally dependency-free (stdlib only) and knows nothing
about databases, web frameworks, or filesystem roots. Paths in the contract
are relative to a future DATA_DIR, never resolved against the local
filesystem here.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Optional

CONTRACT_VERSION = 1

# Any RFC 9562 UUID version (1-8, e.g. the time-ordered UUIDv7), not locked
# to v4 specifically — the contract only needs a stable, provider/language-
# neutral unique identifier, not a particular generation scheme a future
# runner or web app might pick.
_UUID_PATTERN = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-"
    r"[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$"
)


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class JobContractError(ValueError):
    """Raised when a job document fails contract validation.

    Collects every violation found, rather than failing on the first one,
    so a caller (or a test) sees the full picture in one pass.
    """

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("; ".join(errors))


@dataclass(frozen=True)
class JobInput:
    media_path: str
    language: Optional[str] = None


@dataclass(frozen=True)
class JobResult:
    output_path: str
    completed_at: str


@dataclass(frozen=True)
class JobError:
    message: str
    occurred_at: str


@dataclass(frozen=True)
class JobDocument:
    schema_version: int
    job_id: str
    status: JobStatus
    created_at: str
    updated_at: str
    input: JobInput
    result: Optional[JobResult] = None
    error: Optional[JobError] = None


def _is_data_dir_relative_path(value: str) -> bool:
    if not isinstance(value, str) or not value:
        return False
    if value.startswith("/") or value.startswith("\\"):
        return False
    if re.match(r"^[a-zA-Z]:", value):
        return False
    segments = re.split(r"[\\/]", value)
    if any(segment == ".." for segment in segments):
        return False
    return True


def _is_valid_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    normalized = value[:-1] + "+00:00" if value.endswith("Z") else value
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return False
    return parsed.tzinfo is not None


def _validate_input(data: Any, errors: list[str]) -> None:
    if not isinstance(data, dict):
        errors.append("input: must be an object")
        return

    allowed_keys = {"media_path", "language"}
    for key in data:
        if key not in allowed_keys:
            errors.append(f"input: unknown field '{key}'")

    media_path = data.get("media_path")
    if "media_path" not in data:
        errors.append("input.media_path: required field is missing")
    elif not _is_data_dir_relative_path(media_path):
        errors.append(
            "input.media_path: must be a non-empty DATA_DIR-relative path "
            "(no leading '/' and no '..' segments)"
        )

    if "language" in data and data["language"] is not None:
        # No fixed allowlist: the transcriber forwards this value as-is to the
        # provider (see OpenAIProvider.transcribe), so the contract only
        # requires a sensible non-empty string, not a specific language set.
        if not isinstance(data["language"], str) or not data["language"].strip():
            errors.append("input.language: must be a non-empty string when present")


def _validate_result(data: Any, status: Any, errors: list[str]) -> None:
    if status == JobStatus.COMPLETED.value:
        if data is None:
            errors.append("result: required when status is COMPLETED")
            return
        if not isinstance(data, dict):
            errors.append("result: must be an object when status is COMPLETED")
            return

        allowed_keys = {"output_path", "completed_at"}
        for key in data:
            if key not in allowed_keys:
                errors.append(f"result: unknown field '{key}'")

        if "output_path" not in data:
            errors.append("result.output_path: required field is missing")
        elif not _is_data_dir_relative_path(data["output_path"]):
            errors.append(
                "result.output_path: must be a non-empty DATA_DIR-relative path "
                "(no leading '/' and no '..' segments)"
            )

        if "completed_at" not in data:
            errors.append("result.completed_at: required field is missing")
        elif not _is_valid_timestamp(data["completed_at"]):
            errors.append("result.completed_at: must be an ISO 8601 timestamp")
    else:
        if data is not None:
            errors.append(f"result: must be null when status is {status}")


def _validate_error(data: Any, status: Any, errors: list[str]) -> None:
    if status == JobStatus.FAILED.value:
        if data is None:
            errors.append("error: required when status is FAILED")
            return
        if not isinstance(data, dict):
            errors.append("error: must be an object when status is FAILED")
            return

        allowed_keys = {"message", "occurred_at"}
        for key in data:
            if key not in allowed_keys:
                errors.append(f"error: unknown field '{key}'")

        if "message" not in data:
            errors.append("error.message: required field is missing")
        elif not isinstance(data["message"], str) or not data["message"]:
            errors.append("error.message: must be a non-empty string")

        if "occurred_at" not in data:
            errors.append("error.occurred_at: required field is missing")
        elif not _is_valid_timestamp(data["occurred_at"]):
            errors.append("error.occurred_at: must be an ISO 8601 timestamp")
    else:
        if data is not None:
            errors.append(f"error: must be null when status is {status}")


def validate_job_dict(data: Any) -> list[str]:
    """Validate a plain dict against the job contract.

    Returns a list of human-readable violations (empty list means valid).
    Collects every violation rather than stopping at the first.
    """
    errors: list[str] = []

    if not isinstance(data, dict):
        return ["document: must be a JSON object"]

    allowed_top_level = {
        "schema_version",
        "job_id",
        "status",
        "created_at",
        "updated_at",
        "input",
        "result",
        "error",
    }
    for key in data:
        if key not in allowed_top_level:
            errors.append(f"document: unknown field '{key}'")

    # result/error must be present (their value may be null) — matches the
    # JSON Schema's "required" list, which requires the keys to exist even
    # when the associated status makes the value null.
    for key in allowed_top_level:
        if key not in data:
            errors.append(f"{key}: required field is missing")

    if "schema_version" in data and data["schema_version"] != CONTRACT_VERSION:
        errors.append(
            f"schema_version: must be {CONTRACT_VERSION}, got {data['schema_version']!r}"
        )

    if "job_id" in data:
        if not isinstance(data["job_id"], str) or not _UUID_PATTERN.match(data["job_id"]):
            errors.append("job_id: must be a UUID string")

    status = data.get("status")
    if "status" in data:
        valid_statuses = {member.value for member in JobStatus}
        if status not in valid_statuses:
            errors.append(f"status: must be one of {sorted(valid_statuses)}")

    for ts_field in ("created_at", "updated_at"):
        if ts_field in data and not _is_valid_timestamp(data[ts_field]):
            errors.append(f"{ts_field}: must be an ISO 8601 timestamp")

    if "input" in data:
        _validate_input(data["input"], errors)

    if "status" in data and status in {member.value for member in JobStatus}:
        _validate_result(data.get("result"), status, errors)
        _validate_error(data.get("error"), status, errors)

    return errors


def parse_job_document(data: dict) -> JobDocument:
    """Validate and parse a plain dict into a JobDocument.

    Raises JobContractError (with every violation) if the document is invalid.
    """
    errors = validate_job_dict(data)
    if errors:
        raise JobContractError(errors)

    input_data = data["input"]
    job_input = JobInput(
        media_path=input_data["media_path"],
        language=input_data.get("language"),
    )

    result_data = data.get("result")
    job_result = (
        JobResult(
            output_path=result_data["output_path"],
            completed_at=result_data["completed_at"],
        )
        if result_data is not None
        else None
    )

    error_data = data.get("error")
    job_error = (
        JobError(
            message=error_data["message"],
            occurred_at=error_data["occurred_at"],
        )
        if error_data is not None
        else None
    )

    return JobDocument(
        schema_version=data["schema_version"],
        job_id=data["job_id"],
        status=JobStatus(data["status"]),
        created_at=data["created_at"],
        updated_at=data["updated_at"],
        input=job_input,
        result=job_result,
        error=job_error,
    )


def job_document_to_dict(job: JobDocument) -> dict:
    """Serialize a JobDocument back to a plain dict matching the contract."""
    return {
        "schema_version": job.schema_version,
        "job_id": job.job_id,
        "status": job.status.value,
        "created_at": job.created_at,
        "updated_at": job.updated_at,
        "input": {
            key: value
            for key, value in {
                "media_path": job.input.media_path,
                "language": job.input.language,
            }.items()
            if value is not None
        },
        "result": (
            {
                "output_path": job.result.output_path,
                "completed_at": job.result.completed_at,
            }
            if job.result is not None
            else None
        ),
        "error": (
            {
                "message": job.error.message,
                "occurred_at": job.error.occurred_at,
            }
            if job.error is not None
            else None
        ),
    }


def dumps(job: JobDocument) -> str:
    """Serialize a JobDocument to a JSON string."""
    return json.dumps(job_document_to_dict(job), indent=2, sort_keys=True)


def loads(text: str) -> JobDocument:
    """Parse a JSON string into a JobDocument.

    Raises JobContractError on malformed JSON or a document that fails
    contract validation.
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise JobContractError([f"document: invalid JSON ({exc.msg})"]) from exc

    return parse_job_document(data)
