import json
import uuid
from pathlib import Path

import pytest

from theopentranscribe_contract import job
from theopentranscribe_contract import (
    CONTRACT_VERSION,
    JobContractError,
    JobStatus,
    dumps,
    job_document_to_dict,
    loads,
    parse_job_document,
    validate_job_dict,
)

CONTRACT_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = CONTRACT_ROOT / "schema" / "job.v1.schema.json"
EXAMPLES_DIR = CONTRACT_ROOT / "examples"

EXAMPLE_FILES = {
    "queued": EXAMPLES_DIR / "job_queued.json",
    "processing": EXAMPLES_DIR / "job_processing.json",
    "completed": EXAMPLES_DIR / "job_completed.json",
    "failed": EXAMPLES_DIR / "job_failed.json",
}


def load_example(name: str) -> dict:
    return json.loads(EXAMPLE_FILES[name].read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Valid documents: all four statuses
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", list(EXAMPLE_FILES))
def test_valid_examples_parse_without_error(name):
    data = load_example(name)
    assert validate_job_dict(data) == []
    job = parse_job_document(data)
    assert job.status.value == data["status"]


def test_all_four_statuses_are_covered_by_examples():
    statuses = {load_example(name)["status"] for name in EXAMPLE_FILES}
    assert statuses == {member.value for member in JobStatus}


def test_round_trip_serialization_matches_original():
    for name in EXAMPLE_FILES:
        original = load_example(name)
        job = parse_job_document(original)
        assert job_document_to_dict(job) == original


def test_dumps_and_loads_round_trip():
    original = load_example("completed")
    job = parse_job_document(original)
    text = dumps(job)
    reloaded = loads(text)
    assert job_document_to_dict(reloaded) == original


def test_optional_language_field_can_be_omitted():
    data = load_example("processing")
    assert "language" not in data["input"]
    job = parse_job_document(data)
    assert job.input.language is None


# ---------------------------------------------------------------------------
# input.language: provider-neutral, no fixed allowlist
#
# The transcriber's OpenAIProvider.transcribe() forwards whatever language
# string it's given straight through to the OpenAI API with no restriction —
# the `sv`/`en` choice in cli.py's argparse is a CLI UX decision, not an
# engine capability limit. The contract must not invent a stricter allowlist
# than the transcriber itself enforces.
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("language", ["sv", "en", "de", "fr", "pt-BR", "yue"])
def test_arbitrary_language_values_are_accepted(language):
    data = load_example("queued")
    data["input"]["language"] = language
    assert validate_job_dict(data) == []


def test_empty_string_language_is_rejected():
    data = load_example("queued")
    data["input"]["language"] = ""
    errors = validate_job_dict(data)
    assert any(err.startswith("input.language:") for err in errors)


def test_non_string_language_is_rejected():
    data = load_example("queued")
    data["input"]["language"] = 7
    errors = validate_job_dict(data)
    assert any(err.startswith("input.language:") for err in errors)


# ---------------------------------------------------------------------------
# Status enum
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_status", ["INTERRUPTED", "RUNNING", "queued", "", None])
def test_invalid_status_is_rejected(bad_status):
    data = load_example("queued")
    data["status"] = bad_status
    errors = validate_job_dict(data)
    assert any(err.startswith("status:") for err in errors)


# ---------------------------------------------------------------------------
# Required fields
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "field",
    [
        "schema_version",
        "job_id",
        "status",
        "created_at",
        "updated_at",
        "input",
        "result",
        "error",
    ],
)
def test_missing_required_top_level_field_is_rejected(field):
    # All eight top-level keys must be present, even result/error whose
    # value is legitimately null for QUEUED/PROCESSING/FAILED (or
    # QUEUED/PROCESSING/COMPLETED respectively) — this matches the JSON
    # Schema's "required" list, which requires the key to exist.
    data = load_example("queued")
    del data[field]
    errors = validate_job_dict(data)
    assert any(err.startswith(f"{field}:") for err in errors)


def test_missing_media_path_is_rejected():
    data = load_example("queued")
    del data["input"]["media_path"]
    errors = validate_job_dict(data)
    assert any(err.startswith("input.media_path:") for err in errors)


# ---------------------------------------------------------------------------
# schema_version
# ---------------------------------------------------------------------------


def test_current_contract_version_is_1():
    assert CONTRACT_VERSION == 1


@pytest.mark.parametrize("bad_version", [0, 2, "1", None])
def test_wrong_schema_version_is_rejected(bad_version):
    data = load_example("queued")
    data["schema_version"] = bad_version
    errors = validate_job_dict(data)
    assert any(err.startswith("schema_version:") for err in errors)


# ---------------------------------------------------------------------------
# result / error <-> status consistency
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("name", ["queued", "processing", "failed"])
def test_result_present_when_not_completed_is_rejected(name):
    data = load_example(name)
    data["result"] = {
        "output_path": "outputs/x/transcript.txt",
        "completed_at": "2026-09-15T10:05:00Z",
    }
    errors = validate_job_dict(data)
    assert any(err.startswith("result:") for err in errors)


def test_result_missing_when_completed_is_rejected():
    data = load_example("completed")
    data["result"] = None
    errors = validate_job_dict(data)
    assert "result: required when status is COMPLETED" in errors


@pytest.mark.parametrize("name", ["queued", "processing", "completed"])
def test_error_present_when_not_failed_is_rejected(name):
    data = load_example(name)
    data["error"] = {"message": "boom", "occurred_at": "2026-09-15T10:04:00Z"}
    errors = validate_job_dict(data)
    assert any(err.startswith("error:") for err in errors)


def test_error_missing_when_failed_is_rejected():
    data = load_example("failed")
    data["error"] = None
    errors = validate_job_dict(data)
    assert "error: required when status is FAILED" in errors


# ---------------------------------------------------------------------------
# Path rules (DATA_DIR-relative)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "bad_path",
    ["/etc/passwd", "../secrets.txt", "uploads/../../escape.mp4", "", "C:\\evil\\path.mp4"],
)
def test_absolute_or_traversal_media_path_is_rejected(bad_path):
    data = load_example("queued")
    data["input"]["media_path"] = bad_path
    errors = validate_job_dict(data)
    assert any(err.startswith("input.media_path:") for err in errors)


def test_absolute_output_path_is_rejected():
    data = load_example("completed")
    data["result"]["output_path"] = "/etc/passwd"
    errors = validate_job_dict(data)
    assert any(err.startswith("result.output_path:") for err in errors)


# ---------------------------------------------------------------------------
# Unknown fields (strict schema)
# ---------------------------------------------------------------------------


def test_unknown_top_level_field_is_rejected():
    data = load_example("queued")
    data["unexpected"] = "surprise"
    errors = validate_job_dict(data)
    assert any(err.startswith("document: unknown field") for err in errors)


def test_unknown_input_field_is_rejected():
    data = load_example("queued")
    data["input"]["extra"] = "nope"
    errors = validate_job_dict(data)
    assert any(err.startswith("input: unknown field") for err in errors)


# ---------------------------------------------------------------------------
# job_id format
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_id", ["not-a-uuid", "", "12345", 42])
def test_malformed_job_id_is_rejected(bad_id):
    data = load_example("queued")
    data["job_id"] = bad_id
    errors = validate_job_dict(data)
    assert any(err.startswith("job_id:") for err in errors)


@pytest.mark.parametrize(
    "job_id",
    [
        str(uuid.uuid1()),
        str(uuid.uuid4()),
        str(uuid.uuid5(uuid.NAMESPACE_DNS, "theopentranscribe.example")),
        # A UUIDv7 (RFC 9562), the time-ordered version. Written as a literal
        # rather than via uuid.uuid7() since that function requires Python
        # 3.14+, newer than this package's declared requires-python >=3.13.
        "017f22e2-79b0-7cc3-98c4-dc0c0c07398f",
    ],
)
def test_job_id_accepts_any_rfc9562_uuid_version_not_only_v4(job_id):
    # job_id must not be locked to UUID version 4 specifically — a future
    # runner or web app may reasonably choose a different version, including
    # the time-sortable UUIDv7, and the contract shouldn't forbid that.
    data = load_example("queued")
    data["job_id"] = job_id
    assert validate_job_dict(data) == []


# ---------------------------------------------------------------------------
# Timestamps
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("bad_ts", ["2026-09-15", "not-a-date", "2026-09-15T10:00:00", ""])
def test_naive_or_malformed_timestamp_is_rejected(bad_ts):
    data = load_example("queued")
    data["created_at"] = bad_ts
    errors = validate_job_dict(data)
    assert any(err.startswith("created_at:") for err in errors)


# ---------------------------------------------------------------------------
# parse_job_document raises with all collected errors
# ---------------------------------------------------------------------------


def test_parse_job_document_raises_job_contract_error_with_all_violations():
    data = load_example("queued")
    del data["input"]["media_path"]
    data["status"] = "INTERRUPTED"

    with pytest.raises(JobContractError) as exc_info:
        parse_job_document(data)

    messages = exc_info.value.errors
    assert any(msg.startswith("status:") for msg in messages)
    assert any(msg.startswith("input.media_path:") for msg in messages)


# ---------------------------------------------------------------------------
# Malformed JSON input to loads()
# ---------------------------------------------------------------------------


def test_loads_rejects_malformed_json():
    with pytest.raises(JobContractError):
        loads("{not valid json")


def test_loads_rejects_non_object_json():
    with pytest.raises(JobContractError):
        loads("[1, 2, 3]")


# ---------------------------------------------------------------------------
# Schema file <-> Python dataclass drift check
# ---------------------------------------------------------------------------


def test_schema_file_is_valid_json_and_matches_contract_version():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert schema["properties"]["schema_version"]["const"] == CONTRACT_VERSION


def test_schema_top_level_required_fields_match_python_model():
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    schema_fields = set(schema["properties"].keys())

    example = load_example("queued")
    python_fields = set(job_document_to_dict(parse_job_document(example)).keys())

    assert schema_fields == python_fields


def test_schema_required_keys_match_python_enforced_required_keys():
    # The schema's "required" list names the keys that MUST be present
    # (result/error may still be null). Confirm Python's validator enforces
    # presence of exactly the same key set, so the two don't silently drift.
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    schema_required = set(schema["required"])

    data = load_example("queued")
    enforced_required = set()
    for key in schema_required:
        without_key = {k: v for k, v in data.items() if k != key}
        errors = validate_job_dict(without_key)
        if any(err == f"{key}: required field is missing" for err in errors):
            enforced_required.add(key)

    assert enforced_required == schema_required


def test_schema_job_id_pattern_matches_python_uuid_pattern():
    # Guards against the schema and the Python regex silently diverging on
    # which UUID versions are accepted.
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    assert schema["properties"]["job_id"]["pattern"] == job._UUID_PATTERN.pattern


def test_schema_language_has_no_fixed_allowlist():
    # Guards against the schema reintroducing an sv/en enum that the Python
    # validator no longer enforces (or vice versa).
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    language_schema = schema["properties"]["input"]["properties"]["language"]
    assert "enum" not in language_schema
