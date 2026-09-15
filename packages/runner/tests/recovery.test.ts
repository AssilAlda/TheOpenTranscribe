import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jobs, openDb, type DbClient } from "@theopentranscribe/db";

import { recoverStaleProcessingJobs, STALE_PROCESSING_REASON } from "../src/recovery.js";

let dataDir: string;
let db: DbClient;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-runner-recovery-"));
  db = openDb(dataDir);
});

afterEach(() => {
  db.$client.close();
});

function insert(
  db: DbClient,
  jobId: string,
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED",
): void {
  const now = "2026-01-01T00:00:00Z";
  db.insert(jobs)
    .values({
      jobId,
      schemaVersion: 1,
      status,
      createdAt: now,
      updatedAt: now,
      inputMediaPath: `uploads/${jobId}__audio.mp3`,
      inputLanguage: "sv",
      resultOutputPath: status === "COMPLETED" ? `outputs/${jobId}.txt` : null,
      resultCompletedAt: status === "COMPLETED" ? now : null,
      errorMessage: status === "FAILED" ? "some prior failure" : null,
      errorOccurredAt: status === "FAILED" ? now : null,
    })
    .run();
}

describe("recoverStaleProcessingJobs", () => {
  it("does nothing when there are no PROCESSING jobs", () => {
    insert(db, "11111111-1111-4111-8111-111111111111", "QUEUED");
    expect(recoverStaleProcessingJobs(db)).toBe(0);
  });

  it("marks every PROCESSING job FAILED with an explicit reason, and never retries it", () => {
    insert(db, "11111111-1111-4111-8111-111111111111", "PROCESSING");
    insert(db, "22222222-2222-4222-8222-222222222222", "PROCESSING");

    const recovered = recoverStaleProcessingJobs(db);

    expect(recovered).toBe(2);
    const rows = db.select().from(jobs).all();
    for (const row of rows) {
      expect(row.status).toBe("FAILED");
      expect(row.errorMessage).toBe(STALE_PROCESSING_REASON);
      expect(row.errorOccurredAt).not.toBeNull();
      expect(row.resultOutputPath).toBeNull();
    }
  });

  it("leaves QUEUED, COMPLETED, and FAILED jobs untouched", () => {
    insert(db, "11111111-1111-4111-8111-111111111111", "QUEUED");
    insert(db, "22222222-2222-4222-8222-222222222222", "COMPLETED");
    insert(db, "33333333-3333-4333-8333-333333333333", "FAILED");

    recoverStaleProcessingJobs(db);

    const rows = db.select().from(jobs).all();
    const byId = Object.fromEntries(rows.map((row) => [row.jobId, row]));
    expect(byId["11111111-1111-4111-8111-111111111111"]?.status).toBe("QUEUED");
    expect(byId["22222222-2222-4222-8222-222222222222"]?.status).toBe("COMPLETED");
    expect(byId["33333333-3333-4333-8333-333333333333"]?.status).toBe("FAILED");
    expect(byId["33333333-3333-4333-8333-333333333333"]?.errorMessage).toBe("some prior failure");
  });
});
