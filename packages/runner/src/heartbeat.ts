import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Phase 8: Docker liveness signal for the runner container, which has no
 * HTTP surface (subprocess-only coupling to the transcriber, per the locked
 * architecture -- adding an HTTP server here would be scope creep against
 * that design). A fixed-cadence heartbeat file is touched independently of
 * the poll loop's await boundaries (see index.ts) so it keeps advancing
 * while the loop is blocked awaiting a single long-running transcription
 * subprocess, and only goes stale if the Node process/event loop itself is
 * genuinely wedged or dead -- an accurate signal rather than a false
 * positive during a legitimately long job.
 */
const HEARTBEAT_FILENAME = ".runner-heartbeat";

/**
 * Fixed cadence, deliberately independent of RUNNER_POLL_INTERVAL_MS -- an
 * operator setting an extreme poll interval must not silently change health
 * semantics. docker/healthcheck-runner.sh uses a staleness threshold that is
 * a fixed multiple of this value (see that script for the exact threshold).
 */
export const HEARTBEAT_INTERVAL_MS = 15_000;

export function heartbeatPath(dataDir: string): string {
  return join(dataDir, HEARTBEAT_FILENAME);
}

export function touchHeartbeat(dataDir: string): void {
  writeFileSync(heartbeatPath(dataDir), new Date().toISOString());
}
