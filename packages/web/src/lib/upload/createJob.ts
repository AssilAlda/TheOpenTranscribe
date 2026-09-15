import { randomUUID } from "node:crypto";
import { rename, unlink } from "node:fs/promises";

import {
  buildUploadRelativePath,
  jobDocumentToRow,
  jobs,
  resolveWithinDataDir,
  rowToJobDocument,
  type DbClient,
  type JobDocumentLike,
} from "@theopentranscribe/db";

import { ApiError } from "../http";
import { ALLOWED_EXTENSIONS, extensionOf, isAllowedExtension } from "./constants";
import { type ParsedUpload, parseMultipartUpload } from "./parseMultipart";
import { familyForExtension, matchesContainerFamily } from "./signature";

export interface CreateJobDeps {
  db: DbClient;
  dataDir: string;
}

/** extension allowlist + signature/container check + optional-language check. */
function validateUploadContent(parsed: ParsedUpload): void {
  if (!isAllowedExtension(parsed.originalFilename)) {
    throw new ApiError(
      415,
      "unsupported_extension",
      `File extension not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`,
    );
  }

  const family = familyForExtension(extensionOf(parsed.originalFilename));
  if (!family || !matchesContainerFamily(family, parsed.signaturePrefix)) {
    throw new ApiError(
      415,
      "signature_mismatch",
      "File content does not match its claimed extension/container family.",
    );
  }

  if (parsed.language !== undefined && parsed.language.trim() === "") {
    throw new ApiError(400, "invalid_language", "language must be a non-empty string when supplied.");
  }
}

/**
 * Orchestrates the full Phase 5 job-creation flow (docs/ARCHITECTURE.md §15):
 * stream upload to a temp file (parseMultipartUpload) -> validate content ->
 * atomically rename into the locked final upload path -> insert a QUEUED
 * row. Any failure up to and including the DB insert is cleaned up so no
 * orphaned temp file or half-created job is left from the caller's
 * perspective; a hard process crash between rename and insert is the one
 * accepted residual risk (see §15), not handled here.
 */
export async function createJobFromUpload(
  request: Request,
  deps: CreateJobDeps,
): Promise<JobDocumentLike> {
  const jobId = randomUUID();
  const parsed = await parseMultipartUpload(request, jobId, deps.dataDir);

  try {
    validateUploadContent(parsed);
  } catch (err) {
    await unlink(parsed.tempFilePath).catch(() => {
      /* best-effort cleanup */
    });
    throw err;
  }

  const finalRelativePath = buildUploadRelativePath(jobId, parsed.originalFilename);
  const finalAbsolutePath = resolveWithinDataDir(deps.dataDir, finalRelativePath);

  try {
    await rename(parsed.tempFilePath, finalAbsolutePath);
  } catch {
    await unlink(parsed.tempFilePath).catch(() => {
      /* best-effort cleanup */
    });
    throw new ApiError(500, "upload_finalize_failed", "Failed to finalize the uploaded file.");
  }

  const now = new Date().toISOString();
  const doc: JobDocumentLike = {
    schema_version: 1,
    job_id: jobId,
    status: "QUEUED",
    created_at: now,
    updated_at: now,
    input: {
      media_path: finalRelativePath,
      ...(parsed.language ? { language: parsed.language } : {}),
    },
    result: null,
    error: null,
  };

  let insertedRow;
  try {
    insertedRow = deps.db.insert(jobs).values(jobDocumentToRow(doc)).returning().all()[0];
  } catch {
    // DB insert failed after a successful rename -- compensating cleanup so
    // no orphaned job/file exists from the caller's perspective.
    await unlink(finalAbsolutePath).catch(() => {
      /* best-effort cleanup */
    });
    throw new ApiError(500, "job_creation_failed", "Failed to persist the created job.");
  }
  if (!insertedRow) {
    await unlink(finalAbsolutePath).catch(() => {
      /* best-effort cleanup */
    });
    throw new ApiError(500, "job_creation_failed", "Failed to persist the created job.");
  }

  return rowToJobDocument(insertedRow);
}
