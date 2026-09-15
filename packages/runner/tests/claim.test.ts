import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jobs, openDb, type DbClient } from "@theopentranscribe/db";

import { claimNextQueuedJob, markCompleted, markFailed } from "../src/claim.js";

let dataDir: string;
let db: DbClient;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-runner-claim-"));
  db = openDb(dataDir);
});

afterEach(() => {
  db.$client.close();
});

function insertJob(
  db: DbClient,
  jobId: string,
  createdAt: string,
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" = "QUEUED",
): void {
  db.insert(jobs)
    .values({
      jobId,
      schemaVersion: 1,
      status,
      createdAt,
      updatedAt: createdAt,
      inputMediaPath: `uploads/${jobId}__audio.mp3`,
      inputLanguage: "sv",
      resultOutputPath: status === "COMPLETED" ? `outputs/${jobId}.txt` : null,
      resultCompletedAt: status === "COMPLETED" ? createdAt : null,
      errorMessage: status === "FAILED" ? "prior failure" : null,
      errorOccurredAt: status === "FAILED" ? createdAt : null,
    })
    .run();
}

const insertQueued = (db: DbClient, jobId: string, createdAt: string) =>
  insertJob(db, jobId, createdAt, "QUEUED");

describe("claimNextQueuedJob", () => {
  it("returns undefined when the queue is empty", () => {
    expect(claimNextQueuedJob(db)).toBeUndefined();
  });

  it("claims the oldest QUEUED job and transitions it to PROCESSING", () => {
    insertQueued(db, "11111111-1111-4111-8111-111111111111", "2026-01-01T00:00:00Z");
    insertQueued(db, "22222222-2222-4222-8222-222222222222", "2026-01-02T00:00:00Z");

    const claimed = claimNextQueuedJob(db);

    expect(claimed?.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(claimed?.status).toBe("PROCESSING");

    const remainingQueued = db
      .select()
      .from(jobs)
      .all()
      .find((row) => row.jobId === "22222222-2222-4222-8222-222222222222");
    expect(remainingQueued?.status).toBe("QUEUED");
  });

  it("never claims the same job twice", () => {
    insertQueued(db, "11111111-1111-4111-8111-111111111111", "2026-01-01T00:00:00Z");

    const first = claimNextQueuedJob(db);
    const second = claimNextQueuedJob(db);

    expect(first?.jobId).toBe("11111111-1111-4111-8111-111111111111");
    expect(second).toBeUndefined();
  });

  it("does not claim PROCESSING, COMPLETED, or FAILED jobs", () => {
    insertQueued(db, "11111111-1111-4111-8111-111111111111", "2026-01-01T00:00:00Z");
    claimNextQueuedJob(db); // now PROCESSING

    expect(claimNextQueuedJob(db)).toBeUndefined();
  });

  /**
   * The tests above call claimNextQueuedJob twice through the SAME
   * DbClient/connection, which only proves the WHERE clause correctly
   * excludes non-QUEUED rows on a second call — it does not exercise two
   * independent SQLite connections (the realistic "two runner processes
   * against the same DATA_DIR" shape) racing the same claim statement. This
   * test opens a second, independent DbClient against the same DATA_DIR file
   * and interleaves claims from both, so the atomicity is verified across
   * connections, not just across calls on one connection.
   */
  it("never double-claims the same job across two independent connections to the same DATA_DIR", () => {
    const jobIds = Array.from(
      { length: 6 },
      (_, i) => `1111111${i}-1111-4111-8111-11111111111${i}`,
    );
    jobIds.forEach((jobId, i) => insertQueued(db, jobId, `2026-01-0${i + 1}T00:00:00Z`));

    const dbA = db;
    const dbB = openDb(dataDir, { runMigrations: false });
    try {
      const claimedByA: string[] = [];
      const claimedByB: string[] = [];

      // Interleave claims from two separate connections, alternating which
      // one goes first each round, to exercise both orderings of the race.
      for (let i = 0; i < jobIds.length; i++) {
        const first = i % 2 === 0 ? dbA : dbB;
        const second = i % 2 === 0 ? dbB : dbA;
        const firstBucket = first === dbA ? claimedByA : claimedByB;
        const secondBucket = second === dbA ? claimedByA : claimedByB;

        const claimed = claimNextQueuedJob(first);
        if (claimed) firstBucket.push(claimed.jobId);
        const claimedOther = claimNextQueuedJob(second);
        if (claimedOther) secondBucket.push(claimedOther.jobId);
      }

      const allClaimed = [...claimedByA, ...claimedByB];
      expect(allClaimed.sort()).toEqual([...jobIds].sort());
      expect(new Set(allClaimed).size).toBe(jobIds.length); // no duplicates / no double-claim

      const rows = dbA.select().from(jobs).all();
      expect(rows.every((row) => row.status === "PROCESSING")).toBe(true);
    } finally {
      dbB.$client.close();
    }
  });
});

describe("markCompleted / markFailed", () => {
  it("marks a claimed job COMPLETED with a result path and timestamp, and returns true", () => {
    insertQueued(db, "11111111-1111-4111-8111-111111111111", "2026-01-01T00:00:00Z");
    claimNextQueuedJob(db);

    const updated = markCompleted(
      db,
      "11111111-1111-4111-8111-111111111111",
      "outputs/11111111-1111-4111-8111-111111111111.txt",
    );

    expect(updated).toBe(true);
    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("COMPLETED");
    expect(row?.resultOutputPath).toBe("outputs/11111111-1111-4111-8111-111111111111.txt");
    expect(row?.resultCompletedAt).not.toBeNull();
    expect(row?.errorMessage).toBeNull();
  });

  it("marks a claimed job FAILED with an error message and timestamp, and returns true", () => {
    insertQueued(db, "11111111-1111-4111-8111-111111111111", "2026-01-01T00:00:00Z");
    claimNextQueuedJob(db);

    const updated = markFailed(
      db,
      "11111111-1111-4111-8111-111111111111",
      "subprocess exited with code 1",
    );

    expect(updated).toBe(true);
    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("FAILED");
    expect(row?.errorMessage).toBe("subprocess exited with code 1");
    expect(row?.errorOccurredAt).not.toBeNull();
    expect(row?.resultOutputPath).toBeNull();
  });

  it("markCompleted is a no-op and returns false if the job is no longer PROCESSING", () => {
    const jobId = "22222222-2222-4222-8222-222222222222";
    insertJob(db, jobId, "2026-01-01T00:00:00Z", "FAILED");

    const updated = markCompleted(db, jobId, `outputs/${jobId}.txt`);

    expect(updated).toBe(false);
    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("FAILED");
    expect(row?.resultOutputPath).toBeNull();
    expect(row?.errorMessage).toBe("prior failure");
  });

  it("markFailed is a no-op and returns false if the job is no longer PROCESSING", () => {
    const jobId = "33333333-3333-4333-8333-333333333333";
    insertJob(db, jobId, "2026-01-01T00:00:00Z", "COMPLETED");

    const updated = markFailed(db, jobId, "some new failure reason");

    expect(updated).toBe(false);
    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("COMPLETED");
    expect(row?.errorMessage).toBeNull();
    expect(row?.resultOutputPath).toBe(`outputs/${jobId}.txt`);
  });

  it("markCompleted and markFailed are no-ops on a still-QUEUED job (never claimed)", () => {
    const jobId = "44444444-4444-4444-8444-444444444444";
    insertQueued(db, jobId, "2026-01-01T00:00:00Z");

    expect(markCompleted(db, jobId, `outputs/${jobId}.txt`)).toBe(false);
    expect(markFailed(db, jobId, "reason")).toBe(false);

    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("QUEUED");
  });
});
