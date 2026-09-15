import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { jobDocumentToRow, JobLifecycleError, rowToJobDocument } from "../src/mapper.js";
import type { JobDocumentLike } from "../src/mapper.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const EXAMPLES_DIR = resolve(
  __dirname,
  "..",
  "..",
  "contract",
  "examples",
);

function loadExample(name: string): JobDocumentLike {
  const text = readFileSync(resolve(EXAMPLES_DIR, name), "utf-8");
  return JSON.parse(text) as JobDocumentLike;
}

describe("jobDocumentToRow / rowToJobDocument round-trip", () => {
  it.each([
    "job_queued.json",
    "job_processing.json",
    "job_completed.json",
    "job_failed.json",
  ])("round-trips %s unchanged", (fileName) => {
    const original = loadExample(fileName);
    const row = jobDocumentToRow(original);
    const reconstructed = rowToJobDocument(row);
    expect(reconstructed).toEqual(original);
  });
});

describe("jobDocumentToRow lifecycle enforcement", () => {
  const base: JobDocumentLike = {
    schema_version: 1,
    job_id: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    status: "QUEUED",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    input: { media_path: "uploads/x" },
    result: null,
    error: null,
  };

  it("rejects COMPLETED with null result", () => {
    expect(() => jobDocumentToRow({ ...base, status: "COMPLETED" })).toThrow(
      JobLifecycleError,
    );
  });

  it("rejects a non-COMPLETED status with a result set", () => {
    expect(() =>
      jobDocumentToRow({
        ...base,
        status: "QUEUED",
        result: { output_path: "outputs/x.txt", completed_at: "2026-01-01T00:00:00Z" },
      }),
    ).toThrow(JobLifecycleError);
  });

  it("rejects FAILED with null error", () => {
    expect(() => jobDocumentToRow({ ...base, status: "FAILED" })).toThrow(JobLifecycleError);
  });

  it("rejects a non-FAILED status with an error set", () => {
    expect(() =>
      jobDocumentToRow({
        ...base,
        status: "QUEUED",
        error: { message: "oops", occurred_at: "2026-01-01T00:00:00Z" },
      }),
    ).toThrow(JobLifecycleError);
  });

  it("accepts a well-formed QUEUED document", () => {
    expect(() => jobDocumentToRow(base)).not.toThrow();
  });

  it("omits language from the row when absent, and from the reconstructed doc", () => {
    const row = jobDocumentToRow(base);
    expect(row.inputLanguage).toBeNull();
    const doc = rowToJobDocument(row);
    expect(doc.input).not.toHaveProperty("language");
  });
});
