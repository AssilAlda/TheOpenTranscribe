import type { JobRow } from "./schema.js";

/**
 * Mirrors the JobDocument shape (packages/contract,
 * theopentranscribe_contract/job.py) as a plain TS type. This is not a full
 * TypeScript port of the contract's JSON Schema validator — that is the
 * separate, still-open "TypeScript side of the contract" question. This type
 * exists only so packages/db has something concrete to map to/from; it
 * intentionally matches the contract's field names and nesting exactly.
 */
export const JOB_STATUSES = ["QUEUED", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobDocumentLike {
  schema_version: number;
  job_id: string;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  input: {
    media_path: string;
    language?: string | null;
  };
  result: {
    output_path: string;
    completed_at: string;
  } | null;
  error: {
    message: string;
    occurred_at: string;
  } | null;
}

/**
 * Same shape as JobRow, minus the requirement that every nullable field be
 * present with an explicit value already — used as jobDocumentToRow's return
 * type so it's directly assignable both to Drizzle's insert() (NewJobRow)
 * and back into rowToJobDocument (JobRow), without TypeScript treating
 * "optional at insert time" as "possibly undefined".
 */
export type JobRowValues = {
  jobId: string;
  schemaVersion: number;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  inputMediaPath: string;
  inputLanguage: string | null;
  resultOutputPath: string | null;
  resultCompletedAt: string | null;
  errorMessage: string | null;
  errorOccurredAt: string | null;
};

export class JobLifecycleError extends Error {}

/**
 * Enforces the same result/error-follows-status invariants as the job
 * contract (job.py: _validate_result / _validate_error) before a document
 * is flattened into a row, so packages/db can't persist a row that the
 * contract itself would reject. Not a full re-implementation of the
 * contract's validator (see JobDocumentLike above) — just the lifecycle
 * rule that this table's CHECK constraints also encode in SQL.
 */
function assertLifecycleInvariants(doc: JobDocumentLike): void {
  const hasResult = doc.result !== null;
  const hasError = doc.error !== null;

  if (doc.status === "COMPLETED" && !hasResult) {
    throw new JobLifecycleError("result is required when status is COMPLETED");
  }
  if (doc.status !== "COMPLETED" && hasResult) {
    throw new JobLifecycleError(`result must be null when status is ${doc.status}`);
  }
  if (doc.status === "FAILED" && !hasError) {
    throw new JobLifecycleError("error is required when status is FAILED");
  }
  if (doc.status !== "FAILED" && hasError) {
    throw new JobLifecycleError(`error must be null when status is ${doc.status}`);
  }
}

/** Flattens a JobDocument-shaped object into a row ready for insert/update. */
export function jobDocumentToRow(doc: JobDocumentLike): JobRowValues {
  assertLifecycleInvariants(doc);

  return {
    jobId: doc.job_id,
    schemaVersion: doc.schema_version,
    status: doc.status,
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    inputMediaPath: doc.input.media_path,
    inputLanguage: doc.input.language ?? null,
    resultOutputPath: doc.result?.output_path ?? null,
    resultCompletedAt: doc.result?.completed_at ?? null,
    errorMessage: doc.error?.message ?? null,
    errorOccurredAt: doc.error?.occurred_at ?? null,
  };
}

/** Reconstructs a JobDocument-shaped object from a stored row. */
export function rowToJobDocument(row: JobRow): JobDocumentLike {
  if (!JOB_STATUSES.includes(row.status as JobStatus)) {
    throw new JobLifecycleError(`stored row has unknown status: ${row.status}`);
  }
  const status = row.status as JobStatus;

  const result =
    row.resultOutputPath !== null && row.resultCompletedAt !== null
      ? { output_path: row.resultOutputPath, completed_at: row.resultCompletedAt }
      : null;
  const error =
    row.errorMessage !== null && row.errorOccurredAt !== null
      ? { message: row.errorMessage, occurred_at: row.errorOccurredAt }
      : null;

  const doc: JobDocumentLike = {
    schema_version: row.schemaVersion,
    job_id: row.jobId,
    status,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    input: {
      media_path: row.inputMediaPath,
      ...(row.inputLanguage !== null ? { language: row.inputLanguage } : {}),
    },
    result,
    error,
  };

  assertLifecycleInvariants(doc);
  return doc;
}
