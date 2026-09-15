import { spawn } from "node:child_process";

const MAX_STDERR_TAIL_CHARS = 4000;

export interface SpawnCaptureResult {
  /** Process exit code, or null if the process was killed by a signal or never started. */
  code: number | null;
  /** Last MAX_STDERR_TAIL_CHARS characters written to stderr, trimmed. */
  stderrTail: string;
}

/**
 * Generic subprocess runner: relays child stdout/stderr to this process's
 * own stdout/stderr (so operator logs show progress live) while also
 * capturing a bounded tail of stderr to surface as a failure reason.
 * No wall-clock timeout — a locked Phase 4 v1 decision; a long-running
 * legitimate transcription is not killed, and a genuinely stuck runner is
 * expected to be restarted by the operator (which triggers stale-PROCESSING
 * recovery on the next startup).
 *
 * `signal`, if given, is wired into Node's own child_process signal support:
 * aborting it sends SIGTERM to the child and rejects/errors the process with
 * an AbortError. This is not a timeout — nothing aborts it automatically;
 * it's how the runner's graceful-shutdown path (a second explicit
 * SIGINT/SIGTERM from the operator) can ask an in-flight subprocess to stop
 * instead of orphaning it. See index.ts.
 */
export function spawnCapture(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
): Promise<SpawnCaptureResult> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = (result: SpawnCaptureResult) => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };

    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], signal });

    let stderrBuffer = "";
    child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      process.stderr.write(chunk);
      stderrBuffer += chunk.toString("utf-8");
      if (stderrBuffer.length > MAX_STDERR_TAIL_CHARS) {
        stderrBuffer = stderrBuffer.slice(-MAX_STDERR_TAIL_CHARS);
      }
    });

    child.on("error", (err) => {
      const reason =
        err.name === "AbortError"
          ? "subprocess terminated: runner received a forced shutdown request"
          : `failed to start subprocess: ${err.message}`;
      settle({ code: null, stderrTail: reason });
    });

    child.on("close", (code) => {
      settle({ code, stderrTail: stderrBuffer.trim() });
    });
  });
}
