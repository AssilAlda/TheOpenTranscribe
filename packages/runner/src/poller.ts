import { buildOutputRelativePath, resolveWithinDataDir, type DbClient } from "@theopentranscribe/db";

import { claimNextQueuedJob, markCompleted, markFailed } from "./claim.js";
import { runTranscriptionJob } from "./subprocess.js";
import type { RunnerConfig } from "./config.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

/**
 * Claims and fully processes at most one job. Returns true if a job was
 * claimed (whether it ended COMPLETED or FAILED), false if the queue was
 * empty — the caller uses this to decide whether to poll again immediately
 * or sleep first.
 *
 * `signal`, if given, is forwarded to the subprocess so a forced shutdown
 * (see index.ts) can terminate an in-flight transcription instead of
 * orphaning it. markCompleted/markFailed are guarded on the job still being
 * PROCESSING; if something else already transitioned it away (only possible
 * if the single-runner-process invariant was violated — see recovery.ts),
 * the write is a logged no-op rather than an overwrite.
 */
export async function runOneJob(
  db: DbClient,
  config: RunnerConfig,
  signal?: AbortSignal,
): Promise<boolean> {
  const job = claimNextQueuedJob(db);
  if (!job) {
    return false;
  }

  console.log(`[runner] claimed job ${job.jobId}`);

  try {
    const inputAbsolutePath = resolveWithinDataDir(config.dataDir, job.inputMediaPath);
    const outputRelativePath = buildOutputRelativePath(job.jobId);
    const outputAbsolutePath = resolveWithinDataDir(config.dataDir, outputRelativePath);

    const result = await runTranscriptionJob({
      pythonBin: config.pythonBin,
      inputAbsolutePath,
      outputAbsolutePath,
      language: job.inputLanguage,
      signal,
    });

    if (result.ok) {
      const updated = markCompleted(db, job.jobId, outputRelativePath);
      if (updated) {
        console.log(`[runner] job ${job.jobId} COMPLETED`);
      } else {
        console.warn(
          `[runner] job ${job.jobId} finished successfully but was no longer PROCESSING ` +
            `(likely reassigned by a startup recovery sweep) — not overwriting its current status`,
        );
      }
    } else {
      const updated = markFailed(db, job.jobId, result.failureReason);
      console.error(`[runner] job ${job.jobId} FAILED: ${result.failureReason}`);
      if (!updated) {
        console.warn(`[runner] job ${job.jobId} was no longer PROCESSING — failure not recorded over its current status`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    markFailed(db, job.jobId, message);
    console.error(`[runner] job ${job.jobId} FAILED: ${message}`);
  }

  return true;
}

export interface PollLoopHandle {
  /** Stop claiming new jobs once the current one (if any) finishes. */
  stop: () => void;
  /**
   * Ask the currently in-flight job's subprocess to terminate now (SIGTERM
   * via AbortController), instead of waiting for it to finish on its own.
   * A no-op if no job is currently in flight. Never called automatically —
   * only wired to an explicit second operator shutdown signal (index.ts).
   * Not a timeout: nothing triggers this on its own.
   */
  killActiveJob: () => void;
  done: Promise<void>;
}

/**
 * Single-worker poll loop (a deliberate v1 decision): after finishing a job,
 * immediately attempt to claim the next one rather than sleeping first; only
 * sleep for config.pollIntervalMs when the queue was found empty.
 */
export function startPollLoop(db: DbClient, config: RunnerConfig): PollLoopHandle {
  let stopped = false;
  let activeController: AbortController | null = null;

  const done = (async () => {
    while (!stopped) {
      const controller = new AbortController();
      activeController = controller;
      const claimed = await runOneJob(db, config, controller.signal);
      activeController = null;
      if (!claimed && !stopped) {
        await sleep(config.pollIntervalMs);
      }
    }
  })();

  return {
    stop: () => {
      stopped = true;
    },
    killActiveJob: () => {
      activeController?.abort();
    },
    done,
  };
}
