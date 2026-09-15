import { spawnCapture } from "./spawnCapture.js";

export interface RunTranscriptionJobOptions {
  pythonBin: string;
  inputAbsolutePath: string;
  outputAbsolutePath: string;
  language: string | null;
  env?: NodeJS.ProcessEnv;
  /** Aborting this sends SIGTERM to the subprocess; see spawnCapture.ts. */
  signal?: AbortSignal;
}

export interface RunTranscriptionJobResult {
  ok: boolean;
  /** Populated when ok is false: captured stderr tail, or a generic message if stderr was empty. */
  failureReason: string;
}

/**
 * Invokes the Phase 4 subprocess boundary: `python -m transcriber.run_job`
 * (packages/transcriber/transcriber/run_job.py), the thin adapter added
 * specifically for this runner — not the Phase 1 standalone CLI. Exit code
 * 0 means success; any other exit code (or a failure to start the process
 * at all) means failure. Credentials are never read or passed explicitly:
 * the subprocess inherits `env`, which must already contain OPENAI_API_KEY.
 */
export async function runTranscriptionJob(
  options: RunTranscriptionJobOptions,
): Promise<RunTranscriptionJobResult> {
  const { pythonBin, inputAbsolutePath, outputAbsolutePath, language, env = process.env, signal } =
    options;

  const args = [
    "-m",
    "transcriber.run_job",
    "--input",
    inputAbsolutePath,
    "--output",
    outputAbsolutePath,
  ];
  if (language) {
    args.push("--language", language);
  }

  const result = await spawnCapture(pythonBin, args, env, signal);

  if (result.code === 0) {
    return { ok: true, failureReason: "" };
  }

  const failureReason =
    result.stderrTail || `subprocess exited with code ${String(result.code)} and no stderr output`;
  return { ok: false, failureReason };
}
