import { resolveOpenAIConfig } from "@theopentranscribe/provider-config";

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
 * Safe, non-secret messages for the two ways the OpenAI credential can fail
 * to resolve before a subprocess is ever spawned (Owner Decision 3 §7-§8).
 * The `unconfigured` case and the `managed_error` case are kept internally
 * distinguishable (the caller/tests can inspect `resolveOpenAIConfig`'s own
 * return value directly) while the job-facing message stays safe and
 * concise -- a `managed_error` reason ("corrupt" / "unsupported_schema_version"
 * / "read_error") is itself a non-secret category, not raw file content or
 * credential-source internals, so it is safe to surface as-is.
 */
function unconfiguredFailureReason(): string {
  return (
    "OpenAI provider is not configured. Set OPENAI_API_KEY in the server environment, " +
    "or configure a managed API key via the Provider page."
  );
}

function managedErrorFailureReason(reason: string): string {
  return `OpenAI provider configuration could not be read (${reason}). Check the managed provider configuration.`;
}

/**
 * Invokes the Phase 4 subprocess boundary: `python -m transcriber.run_job`
 * (packages/transcriber/transcriber/run_job.py), the thin adapter added
 * specifically for this runner — not the Phase 1 standalone CLI. Exit code
 * 0 means success; any other exit code (or a failure to start the process
 * at all) means failure.
 *
 * Owner Decision 3: the effective `openai_api` credential is resolved fresh
 * (env > managed > unconfigured, via @theopentranscribe/provider-config)
 * immediately before every spawn -- never cached across jobs. If nothing is
 * configured, or the managed configuration can't be read, this fails safely
 * *before* spawning the subprocess at all, with a safe message that reveals
 * no credential-source internals or secret material. Once a job has
 * resolved its credential and started its subprocess, it keeps that
 * snapshot for its own lifetime regardless of any later configuration
 * change -- this function is called once per job, so that snapshot
 * semantics fall out naturally from not caching anything across calls.
 *
 * The resolved credential reaches the child only via its environment
 * (never CLI args, JobDocument, DB fields, or URLs): `env` is shallow-copied
 * and only `OPENAI_API_KEY` is overridden on the copy -- the runner's own
 * `process.env` is never mutated, and the constructed environment object is
 * never logged or serialized.
 */
export async function runTranscriptionJob(
  options: RunTranscriptionJobOptions,
): Promise<RunTranscriptionJobResult> {
  const { pythonBin, inputAbsolutePath, outputAbsolutePath, language, env = process.env, signal } =
    options;

  const resolved = await resolveOpenAIConfig(env);
  if (resolved.kind === "unconfigured") {
    return { ok: false, failureReason: unconfiguredFailureReason() };
  }
  if (resolved.kind === "managed_error") {
    return { ok: false, failureReason: managedErrorFailureReason(resolved.reason) };
  }

  const childEnv: NodeJS.ProcessEnv = { ...env, OPENAI_API_KEY: resolved.apiKey };

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

  const result = await spawnCapture(pythonBin, args, childEnv, signal, [resolved.apiKey]);

  if (result.code === 0) {
    return { ok: true, failureReason: "" };
  }

  const failureReason =
    result.stderrTail || `subprocess exited with code ${String(result.code)} and no stderr output`;
  return { ok: false, failureReason };
}
