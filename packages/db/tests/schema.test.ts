import Database from "better-sqlite3";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { dbFilePath } from "../src/paths.js";
import { openDb, type DbClient } from "../src/client.js";

let dataDir: string;
let db: DbClient;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-db-schema-"));
  db = openDb(dataDir);
});

afterEach(() => {
  db.$client.close();
});

describe("migrations", () => {
  it("creates the jobs table with the expected columns", () => {
    const raw = new Database(dbFilePath(dataDir));
    const columns = raw
      .prepare("PRAGMA table_info(jobs)")
      .all() as Array<{ name: string; notnull: number; pk: number }>;
    raw.close();

    const byName = Object.fromEntries(columns.map((c) => [c.name, c]));
    expect(Object.keys(byName).sort()).toEqual(
      [
        "job_id",
        "schema_version",
        "status",
        "created_at",
        "updated_at",
        "input_media_path",
        "input_language",
        "result_output_path",
        "result_completed_at",
        "error_message",
        "error_occurred_at",
      ].sort(),
    );
    expect(byName.job_id?.pk).toBe(1);
    expect(byName.status?.notnull).toBe(1);
    expect(byName.result_output_path?.notnull).toBe(0);
  });

  it("creates the expected indexes", () => {
    const raw = new Database(dbFilePath(dataDir));
    const indexes = raw.prepare("PRAGMA index_list(jobs)").all() as Array<{ name: string }>;
    raw.close();

    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_jobs_status");
    expect(names).toContain("idx_jobs_created_at");
  });

  it("is idempotent: opening an already-migrated DB again does not error", () => {
    expect(() => openDb(dataDir).$client.close()).not.toThrow();
  });
});

describe("WAL mode", () => {
  it("is enabled after openDb", () => {
    const raw = new Database(dbFilePath(dataDir));
    const mode = raw.pragma("journal_mode", { simple: true });
    raw.close();
    expect(mode).toBe("wal");
  });
});

describe("CHECK constraints", () => {
  it("rejects an invalid status value", () => {
    const raw = new Database(dbFilePath(dataDir));
    expect(() =>
      raw
        .prepare(
          `INSERT INTO jobs (job_id, schema_version, status, created_at, updated_at, input_media_path)
           VALUES (?, 1, 'BOGUS', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'uploads/x')`,
        )
        .run("11111111-1111-4111-8111-111111111111"),
    ).toThrow(/CHECK constraint failed/);
    raw.close();
  });

  it("rejects COMPLETED without a result", () => {
    const raw = new Database(dbFilePath(dataDir));
    expect(() =>
      raw
        .prepare(
          `INSERT INTO jobs (job_id, schema_version, status, created_at, updated_at, input_media_path)
           VALUES (?, 1, 'COMPLETED', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'uploads/x')`,
        )
        .run("22222222-1111-4111-8111-111111111111"),
    ).toThrow(/CHECK constraint failed/);
    raw.close();
  });

  it("rejects a QUEUED job that has a result set", () => {
    const raw = new Database(dbFilePath(dataDir));
    expect(() =>
      raw
        .prepare(
          `INSERT INTO jobs (job_id, schema_version, status, created_at, updated_at, input_media_path, result_output_path, result_completed_at)
           VALUES (?, 1, 'QUEUED', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'uploads/x', 'outputs/x.txt', '2026-01-01T00:00:00Z')`,
        )
        .run("33333333-1111-4111-8111-111111111111"),
    ).toThrow(/CHECK constraint failed/);
    raw.close();
  });

  it("rejects FAILED without an error", () => {
    const raw = new Database(dbFilePath(dataDir));
    expect(() =>
      raw
        .prepare(
          `INSERT INTO jobs (job_id, schema_version, status, created_at, updated_at, input_media_path)
           VALUES (?, 1, 'FAILED', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'uploads/x')`,
        )
        .run("44444444-1111-4111-8111-111111111111"),
    ).toThrow(/CHECK constraint failed/);
    raw.close();
  });

  it("accepts a valid QUEUED row", () => {
    const raw = new Database(dbFilePath(dataDir));
    expect(() =>
      raw
        .prepare(
          `INSERT INTO jobs (job_id, schema_version, status, created_at, updated_at, input_media_path)
           VALUES (?, 1, 'QUEUED', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 'uploads/x')`,
        )
        .run("55555555-1111-4111-8111-111111111111"),
    ).not.toThrow();
    raw.close();
  });
});
