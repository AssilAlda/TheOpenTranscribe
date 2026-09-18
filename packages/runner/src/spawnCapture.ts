import { spawn } from "node:child_process";

import { StreamRedactor } from "./streamRedactor.js";

const MAX_STDERR_TAIL_CHARS = 4000;

export interface SpawnCaptureResult {
  /** Process exit code, or null if the process was killed by a signal or never started. */
  code: number | null;
  /** Last MAX_STDERR_TAIL_CHARS characters written to stderr, trimmed, already redacted. */
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
 *
 * `knownSecrets` (Owner Decision 10 §10): the credential(s) already resolved
 * in-memory for this job's spawn, redacted by exact value ahead of generic
 * pattern matching. Never persisted/logged/cached by this function -- only
 * used transiently to build the redaction pass for this one call.
 *
 * Owner Decision 10, stream-safe redaction (blocker B1): stderr is fed
 * through a single StreamRedactor (see streamRedactor.ts) shared by both
 * sinks below -- the live relay to this process's own stderr, and the
 * bounded tail later persisted into jobs.error_message. There is
 * deliberately no "raw to logs, redacted to DB" split (Decision 10 §9), and
 * no per-chunk-only redaction that could let a credential split across a
 * chunk boundary slip through unredacted -- see streamRedactor.ts for why
 * line-buffering closes that gap rather than just narrowing it.
 */
export function spawnCapture(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  signal?: AbortSignal,
  knownSecrets: readonly string[] = [],
): Promise<SpawnCaptureResult> {
  return new Promise((resolvePromise) => {
    let settled = false;
    const settle = (result: SpawnCaptureResult) => {
      if (settled) return;
      settled = true;
      resolvePromise(result);
    };

    const child = spawn(command, args, { env, stdio: ["ignore", "pipe", "pipe"], signal });

    const redactor = new StreamRedactor(knownSecrets);
    let stderrBuffer = "";
    const appendSafe = (safe: string) => {
      if (!safe) return;
      process.stderr.write(safe);
      stderrBuffer += safe;
      if (stderrBuffer.length > MAX_STDERR_TAIL_CHARS) {
        stderrBuffer = stderrBuffer.slice(-MAX_STDERR_TAIL_CHARS);
      }
    };

    child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr?.on("data", (chunk: Buffer) => {
      appendSafe(redactor.push(chunk.toString("utf-8")));
    });

    child.on("error", (err) => {
      const reason =
        err.name === "AbortError"
          ? "subprocess terminated: runner received a forced shutdown request"
          : `failed to start subprocess: ${err.message}`;
      settle({ code: null, stderrTail: reason });
    });

    child.on("close", (code) => {
      appendSafe(redactor.flush());
      settle({ code, stderrTail: stderrBuffer.trim() });
    });
  });
}
