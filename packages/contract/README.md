# TheOpenTranscribe Job Contract

A small, explicit, versioned JSON contract describing a transcription job.
It is the interface the web application (`packages/web`) and background
runner (`packages/runner`) exchange job state through — it defines no
database, no HTTP layer, and no infrastructure. It only describes the shape
of a job document.

This package does not implement a runner, a database, or a web server.
Those live in `packages/runner`, `packages/db`, and `packages/web`; this
contract is what they agree on.

## Files

- `schema/job.v1.schema.json` — canonical JSON Schema (Draft 2020-12), the
  source of truth for the contract shape. Language-agnostic; a future
  TypeScript consumer can generate types/validators from it.
- `examples/` — one valid example document per job status
  (`QUEUED`, `PROCESSING`, `COMPLETED`, `FAILED`).
- `python/theopentranscribe_contract/` — a dependency-free Python
  implementation: dataclasses, an enum for status, and hand-rolled
  validation (`validate_job_dict`, `parse_job_document`, `job_document_to_dict`,
  `dumps`, `loads`).

## Job lifecycle

```
QUEUED -> PROCESSING -> COMPLETED
                      -> FAILED
```

There is no `INTERRUPTED` status. If the runner restarts and finds a
stale `PROCESSING` job, that job is marked `FAILED` with an explicit
reason in `error.message` — it is not retried automatically, because the
underlying transcription call may already have run and cost provider
credits. A manual retry creates a new `QUEUED` job. That behavior lives in
`packages/runner` (see `src/recovery.ts`), not here; the contract is just
shaped to remain compatible with it.

## Document shape

```json
{
  "schema_version": 1,
  "job_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "QUEUED",
  "created_at": "2026-09-15T10:00:00Z",
  "updated_at": "2026-09-15T10:00:00Z",
  "input": {
    "media_path": "uploads/3fa85f64-5717-4562-b3fc-2c963f66afa6/original.mp4",
    "language": "sv"
  },
  "result": null,
  "error": null
}
```

- `input` describes what to transcribe. `media_path` is required and must be
  relative to `DATA_DIR` (no leading `/`, no `..` segments) — never an
  arbitrary filesystem path. `language` is optional and, if present, must be
  a non-empty string; it is forwarded to the transcription provider as-is
  (matching the transcriber's `OpenAIProvider.transcribe`, which passes
  whatever language string it's given straight through to the provider). The contract does not impose a fixed language allowlist — that
  would be a product/CLI-level decision, not a contract-level one. Omit the
  field for automatic language detection.
- `result` is required and populated only when `status` is `COMPLETED`; it
  must be `null` otherwise. `output_path` follows the same DATA_DIR-relative
  rule as `media_path`. TXT is the only output format planned for v1 — there
  is no format field, and no SRT/VTT timing concepts.
- `error` is required and populated only when `status` is `FAILED`; it must
  be `null` otherwise. `message` is a human-readable failure reason.

All objects are validated strictly: unknown fields are rejected everywhere
in the document.

## Versioning

`schema_version` is an integer, currently `1`
(`theopentranscribe_contract.CONTRACT_VERSION`). Validation rejects any
document whose `schema_version` doesn't match the version the validator
implements. A breaking change to the contract gets a new
`schema/job.v2.schema.json` alongside this one, and a bumped
`CONTRACT_VERSION` in the Python package, rather than mutating v1 in place.

## Using it from Python

```python
from theopentranscribe_contract import parse_job_document, JobContractError

try:
    job = parse_job_document(data)
except JobContractError as exc:
    for violation in exc.errors:
        print(violation)
```

No install is required to run the tests — `pyproject.toml` sets
`pythonpath = ["."]` so `pytest` can be run directly from
`packages/contract/python`.

## Tests

```bash
cd packages/contract/python
../../transcriber/.venv/bin/pytest
```

(Any Python 3.13+ interpreter with `pytest` installed works; the existing
`packages/transcriber/.venv` already has one and this package has no
runtime dependencies of its own.)
