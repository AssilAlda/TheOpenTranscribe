import { mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildOutputRelativePath,
  jobs,
  openDb,
  resolveWithinDataDir,
  type DbClient,
} from "@theopentranscribe/db";

import { claimNextQueuedJob, markCompleted, markFailed } from "../src/claim.js";
import { loadConfig, type RunnerConfig } from "../src/config.js";
import { spawnCapture } from "../src/spawnCapture.js";

/**
 * End-to-end test of the real (unmocked) spawn -> claim/mark pipeline,
 * standing in for `python -m transcriber.run_job` with a small inline Node
 * script that mimics its argument contract (--input/--output/--language in,
 * exit 0/1, writes the output file on success). This proves the runner's
 * subprocess plumbing without requiring a Python venv, ffmpeg, or network
 * access — the real transcriber module is exercised separately by
 * packages/transcriber's own pytest suite (tests/test_run_job.py).
 *
 * Exercises spawnCapture + claim/mark directly rather than through
 * runTranscriptionJob/runOneJob, since those hardcode the real
 * `-m transcriber.run_job` module invocation; their argument-construction
 * and status-mapping logic is covered separately (with the subprocess
 * mocked) by subprocess.test.ts and poller.test.ts.
 */
const FAKE_PYTHON_SCRIPT = `
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(1);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const input = get("--input");
const output = get("--output");
const language = get("--language");
if (!fs.existsSync(input)) {
  console.error("input file does not exist: " + input);
  process.exit(1);
}
if (language === "fail-me") {
  console.error("Transcription failed: simulated provider error");
  process.exit(1);
}
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, "transcript for " + path.basename(input) + "\\n");
process.exit(0);
`;

let dataDir: string;
let db: DbClient;
let config: RunnerConfig;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-runner-e2e-"));
  db = openDb(dataDir);
  config = loadConfig({ DATA_DIR: dataDir, TRANSCRIBER_PYTHON_BIN: process.execPath });
});

afterEach(() => {
  db.$client.close();
});

async function seedQueuedJobWithMediaFile(jobId: string, language: string | null): Promise<string> {
  const now = "2026-01-01T00:00:00Z";
  db.insert(jobs)
    .values({
      jobId,
      schemaVersion: 1,
      status: "QUEUED",
      createdAt: now,
      updatedAt: now,
      inputMediaPath: `uploads/${jobId}__audio.mp3`,
      inputLanguage: language,
      resultOutputPath: null,
      resultCompletedAt: null,
      errorMessage: null,
      errorOccurredAt: null,
    })
    .run();

  const inputAbsolutePath = resolveWithinDataDir(dataDir, `uploads/${jobId}__audio.mp3`);
  await mkdir(join(dataDir, "uploads"), { recursive: true });
  await writeFile(inputAbsolutePath, "fake audio bytes");
  return inputAbsolutePath;
}

describe("end-to-end: claim -> real subprocess spawn -> mark COMPLETED/FAILED", () => {
  it("writes the transcript file and marks the job COMPLETED", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    const inputAbsolutePath = await seedQueuedJobWithMediaFile(jobId, "sv");
    const outputRelativePath = buildOutputRelativePath(jobId);
    const outputAbsolutePath = resolveWithinDataDir(dataDir, outputRelativePath);

    expect(claimNextQueuedJob(db)?.jobId).toBe(jobId);

    const result = await spawnCapture(
      config.pythonBin,
      [
        "-e",
        FAKE_PYTHON_SCRIPT,
        "--",
        "--input",
        inputAbsolutePath,
        "--output",
        outputAbsolutePath,
        "--language",
        "sv",
      ],
      process.env,
    );
    expect(result.code).toBe(0);

    markCompleted(db, jobId, outputRelativePath);

    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("COMPLETED");
    expect(row?.resultOutputPath).toBe(outputRelativePath);
    expect(await readFile(outputAbsolutePath, "utf-8")).toContain("transcript for");
  });

  it("marks the job FAILED when the subprocess exits non-zero", async () => {
    const jobId = "22222222-2222-4222-8222-222222222222";
    const inputAbsolutePath = await seedQueuedJobWithMediaFile(jobId, "fail-me");
    const outputAbsolutePath = resolveWithinDataDir(dataDir, buildOutputRelativePath(jobId));

    claimNextQueuedJob(db);

    const result = await spawnCapture(
      config.pythonBin,
      [
        "-e",
        FAKE_PYTHON_SCRIPT,
        "--",
        "--input",
        inputAbsolutePath,
        "--output",
        outputAbsolutePath,
        "--language",
        "fail-me",
      ],
      process.env,
    );
    expect(result.code).toBe(1);

    markFailed(db, jobId, result.stderrTail);

    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("FAILED");
    expect(row?.errorMessage).toContain("simulated provider error");
  });
});
