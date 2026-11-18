# Job contract

Part of [TheOpenTranscribe](../../README.md).

The versioned JSON format that describes a transcription job. The [web app](../web), [runner](../runner) and [database](../db) all agree on this shape.

### Lifecycle

```
QUEUED ──▶ PROCESSING ──▶ COMPLETED
                     └──▶ FAILED
```

A job interrupted by a crash is marked `FAILED`, not retried, because the provider may already have charged for it. To try again, upload the file again; that creates a new job.

### Example

```json
{
  "schema_version": 1,
  "job_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "COMPLETED",
  "created_at": "2026-09-15T10:00:00Z",
  "updated_at": "2026-09-15T10:04:12Z",
  "input": { "media_path": "uploads/3fa85f64-…__interview.mp4", "language": "sv" },
  "result": { "output_path": "outputs/3fa85f64-….txt", "completed_at": "2026-09-15T10:04:12Z" },
  "error": null
}
```

More examples, one per status, are in [`examples/`](examples).

### Rules

| Field | Rule |
|---|---|
| `input.media_path` | Required. Relative to `DATA_DIR`: no leading `/`, no `..` |
| `input.language` | Optional. Leave out for automatic detection |
| `result` | Set only when `COMPLETED`, otherwise `null` |
| `error` | Set only when `FAILED` (`{ message, occurred_at }`), otherwise `null` |
| Unknown fields | Rejected everywhere |

### Files

| Path | Contents |
|---|---|
| [`schema/job.v1.schema.json`](schema/job.v1.schema.json) | JSON Schema (Draft 2020-12), the source of truth |
| [`examples/`](examples) | A valid document for each status |
| [`python/`](python) | Dependency-free Python validator |

### Usage (Python)

```python
from theopentranscribe_contract import parse_job_document, JobContractError

try:
    job = parse_job_document(data)
except JobContractError as exc:
    for violation in exc.errors:
        print(violation)
```

### Versioning

`schema_version` is currently `1`. A breaking change gets a new `job.v2.schema.json` next to v1 instead of changing v1.

### Tests

```bash
cd packages/contract/python
pytest
```
