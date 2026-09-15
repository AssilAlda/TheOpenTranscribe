import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runTranscriptionJobMock = vi.fn();
vi.mock("../src/subprocess.js", () => ({
  runTranscriptionJob: (...args: unknown[]) => runTranscriptionJobMock(...args),
}));

const { jobs, openDb, eq } = await import("@theopentranscribe/db");
const { runOneJob, startPollLoop } = await import("../src/poller.js");
const { loadConfig } = await import("../src/config.js");

let dataDir: string;
let db: Awaited<ReturnType<typeof openDb>>;
let config: ReturnType<typeof loadConfig>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-runner-poller-"));
  db = openDb(dataDir);
  config = loadConfig({ DATA_DIR: dataDir, TRANSCRIBER_PYTHON_BIN: "/venv/bin/python" });
  runTranscriptionJobMock.mockReset();
});

afterEach(() => {
  db.$client.close();
});

function insertQueued(jobId: string, language: string | null = "sv"): void {
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
}

describe("runOneJob", () => {
  it("returns false and calls nothing when the queue is empty", async () => {
    const claimed = await runOneJob(db, config);
    expect(claimed).toBe(false);
    expect(runTranscriptionJobMock).not.toHaveBeenCalled();
  });

  it("resolves DATA_DIR-relative input/output paths to absolute paths before invoking the subprocess", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId, "sv");
    runTranscriptionJobMock.mockResolvedValueOnce({ ok: true, failureReason: "" });

    await runOneJob(db, config);

    expect(runTranscriptionJobMock).toHaveBeenCalledWith({
      pythonBin: "/venv/bin/python",
      inputAbsolutePath: resolve(dataDir, `uploads/${jobId}__audio.mp3`),
      outputAbsolutePath: resolve(dataDir, `outputs/${jobId}.txt`),
      language: "sv",
      signal: undefined,
    });
  });

  it("forwards a given AbortSignal through to runTranscriptionJob", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId);
    runTranscriptionJobMock.mockResolvedValueOnce({ ok: true, failureReason: "" });
    const controller = new AbortController();

    await runOneJob(db, config, controller.signal);

    expect(runTranscriptionJobMock).toHaveBeenCalledWith(
      expect.objectContaining({ signal: controller.signal }),
    );
  });

  it("does not overwrite a job that changed status while the subprocess was running (guard no-op)", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId);

    runTranscriptionJobMock.mockImplementationOnce(async () => {
      // Simulate a concurrent process (e.g. a second runner's startup
      // recovery sweep) flipping this job away from PROCESSING while this
      // subprocess was still running.
      db.update(jobs)
        .set({
          status: "FAILED",
          errorMessage: "concurrent recovery sweep",
          errorOccurredAt: "2026-01-01T00:00:01Z",
          updatedAt: "2026-01-01T00:00:01Z",
        })
        .where(eq(jobs.jobId, jobId))
        .run();
      return { ok: true, failureReason: "" };
    });

    await runOneJob(db, config);

    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("FAILED");
    expect(row?.errorMessage).toBe("concurrent recovery sweep");
    expect(row?.resultOutputPath).toBeNull(); // markCompleted's write was a no-op
  });

  it("marks the job COMPLETED with the DATA_DIR-relative output path on success", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId);
    runTranscriptionJobMock.mockResolvedValueOnce({ ok: true, failureReason: "" });

    await runOneJob(db, config);

    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("COMPLETED");
    expect(row?.resultOutputPath).toBe(`outputs/${jobId}.txt`);
  });

  it("marks the job FAILED with the subprocess failure reason on failure", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId);
    runTranscriptionJobMock.mockResolvedValueOnce({ ok: false, failureReason: "boom" });

    await runOneJob(db, config);

    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("FAILED");
    expect(row?.errorMessage).toBe("boom");
  });

  it("marks the job FAILED if the subprocess wrapper throws", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId);
    runTranscriptionJobMock.mockRejectedValueOnce(new Error("unexpected"));

    await runOneJob(db, config);

    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("FAILED");
    expect(row?.errorMessage).toBe("unexpected");
  });

  it("returns true once a job has been claimed, regardless of outcome", async () => {
    insertQueued("11111111-1111-4111-8111-111111111111");
    runTranscriptionJobMock.mockResolvedValueOnce({ ok: false, failureReason: "boom" });

    expect(await runOneJob(db, config)).toBe(true);
  });
});

describe("startPollLoop: graceful shutdown / kill-active-job", () => {
  it("stop() lets an in-flight job finish naturally before done resolves (no orphaning)", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId);

    let resolveSubprocess!: (value: { ok: boolean; failureReason: string }) => void;
    runTranscriptionJobMock.mockImplementationOnce(
      () =>
        new Promise((resolvePromise) => {
          resolveSubprocess = resolvePromise;
        }),
    );

    const loop = startPollLoop(db, config);
    // Let the loop claim the job and enter the (still-pending) subprocess call.
    await vi.waitFor(() => {
      const [row] = db.select().from(jobs).all();
      expect(row?.status).toBe("PROCESSING");
    });

    loop.stop();

    let doneSettled = false;
    void loop.done.then(() => {
      doneSettled = true;
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(doneSettled).toBe(false); // still waiting on the in-flight job

    resolveSubprocess({ ok: true, failureReason: "" });
    await loop.done;

    expect(doneSettled).toBe(true);
    const [row] = db.select().from(jobs).all();
    expect(row?.status).toBe("COMPLETED"); // terminal state was written before done resolved
  });

  it("killActiveJob() aborts the in-flight job's signal instead of waiting for it", async () => {
    const jobId = "11111111-1111-4111-8111-111111111111";
    insertQueued(jobId);

    let capturedSignal: AbortSignal | undefined;
    runTranscriptionJobMock.mockImplementationOnce(async (options: { signal?: AbortSignal }) => {
      capturedSignal = options.signal;
      return { ok: false, failureReason: "subprocess terminated: runner received a forced shutdown request" };
    });

    const loop = startPollLoop(db, config);
    await vi.waitFor(() => {
      expect(capturedSignal).toBeDefined();
    });

    expect(capturedSignal?.aborted).toBe(false);
    loop.killActiveJob();
    expect(capturedSignal?.aborted).toBe(true);

    loop.stop();
    await loop.done;
  });

  it("killActiveJob() is a no-op once the loop has stopped and no job is in flight", async () => {
    const loop = startPollLoop(db, config); // empty queue: the one iteration finishes fast
    loop.stop();
    await loop.done;

    expect(() => loop.killActiveJob()).not.toThrow();
  });
});
