import { eq } from "drizzle-orm";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb, type DbClient } from "../src/client.js";
import { jobDocumentToRow, rowToJobDocument } from "../src/mapper.js";
import type { JobDocumentLike } from "../src/mapper.js";
import { jobs } from "../src/schema.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const EXAMPLES_DIR = resolve(__dirname, "..", "..", "contract", "examples");

function loadExample(name: string): JobDocumentLike {
  const text = readFileSync(resolve(EXAMPLES_DIR, name), "utf-8");
  return JSON.parse(text) as JobDocumentLike;
}

let dataDir: string;
let db: DbClient;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-db-integration-"));
  db = openDb(dataDir);
});

afterEach(() => {
  db.$client.close();
});

describe("end-to-end persistence against Phase 2 contract examples", () => {
  const fixtures: Array<[string, string]> = [
    ["job_queued.json", "11111111-1111-4111-8111-111111111111"],
    ["job_processing.json", "22222222-2222-4222-8222-222222222222"],
    ["job_completed.json", "33333333-3333-4333-8333-333333333333"],
    ["job_failed.json", "44444444-4444-4444-8444-444444444444"],
  ];

  it("inserts one job per status and reads each back as an equivalent document", () => {
    for (const [fileName, jobId] of fixtures) {
      const original = { ...loadExample(fileName), job_id: jobId };
      db.insert(jobs).values(jobDocumentToRow(original)).run();
    }

    for (const [fileName, jobId] of fixtures) {
      const original = { ...loadExample(fileName), job_id: jobId };
      const [row] = db.select().from(jobs).where(eq(jobs.jobId, jobId)).all();
      expect(row).toBeDefined();
      const reconstructed = rowToJobDocument(row!);
      expect(reconstructed).toEqual(original);
    }
  });

  it("queries QUEUED jobs via the status index", () => {
    for (const [fileName, jobId] of fixtures) {
      const original = { ...loadExample(fileName), job_id: jobId };
      db.insert(jobs).values(jobDocumentToRow(original)).run();
    }

    const queued = db.select().from(jobs).where(eq(jobs.status, "QUEUED")).all();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.jobId).toBe(fixtures[0]?.[1]);
  });

  it("orders jobs by created_at for history queries", () => {
    for (const [fileName, jobId] of fixtures) {
      const original = { ...loadExample(fileName), job_id: jobId };
      db.insert(jobs).values(jobDocumentToRow(original)).run();
    }

    const rows = db.select().from(jobs).orderBy(jobs.createdAt).all();
    expect(rows).toHaveLength(fixtures.length);
  });

  it("rejects inserting a duplicate job_id", () => {
    const [fileName, jobId] = fixtures[0]!;
    const original = { ...loadExample(fileName), job_id: jobId };
    db.insert(jobs).values(jobDocumentToRow(original)).run();
    expect(() => db.insert(jobs).values(jobDocumentToRow(original)).run()).toThrow();
  });
});
