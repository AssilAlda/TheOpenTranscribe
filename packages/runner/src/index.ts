import { openDb } from "@theopentranscribe/db";

import { loadConfig } from "./config.js";
import { HEARTBEAT_INTERVAL_MS, touchHeartbeat } from "./heartbeat.js";
import { recoverStaleProcessingJobs } from "./recovery.js";
import { startPollLoop } from "./poller.js";

function main(): void {
  const config = loadConfig();
  const db = openDb(config.dataDir);

  const recovered = recoverStaleProcessingJobs(db);
  if (recovered > 0) {
    console.log(`[runner] recovered ${recovered} stale PROCESSING job(s) as FAILED on startup`);
  }

  console.log(
    `[runner] starting, DATA_DIR=${config.dataDir}, pollIntervalMs=${config.pollIntervalMs}`,
  );

  // Docker healthcheck signal (see heartbeat.ts): runs on its own fixed
  // timer, independent of the poll loop's await boundaries, so it keeps
  // advancing while the loop is blocked on a single long-running job.
  touchHeartbeat(config.dataDir);
  const heartbeatTimer = setInterval(() => touchHeartbeat(config.dataDir), HEARTBEAT_INTERVAL_MS);

  const loop = startPollLoop(db, config);

  // First signal: stop claiming new jobs, let the active one (if any) finish
  // naturally — no timeout, per the locked Phase 4 decision. Second signal:
  // additionally ask the active job's subprocess to terminate now (SIGTERM)
  // instead of leaving it to run orphaned if the operator forces an exit.
  // Either way, index.ts still only closes the DB and exits after `loop.done`
  // resolves, i.e. after the in-flight job's terminal DB write completes.
  let shutdownRequested = false;
  const shutdown = (signal: string) => {
    if (shutdownRequested) {
      console.log(`[runner] received second ${signal}, asking the active subprocess to terminate...`);
      loop.killActiveJob();
      return;
    }
    shutdownRequested = true;
    console.log(
      `[runner] received ${signal}, shutting down after the current job finishes ` +
        `(send it again to terminate an active subprocess now)...`,
    );
    loop.stop();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  loop.done
    .then(() => {
      clearInterval(heartbeatTimer);
      db.$client.close();
      process.exit(0);
    })
    .catch((err) => {
      clearInterval(heartbeatTimer);
      console.error("[runner] fatal error in poll loop:", err);
      db.$client.close();
      process.exit(1);
    });
}

main();
