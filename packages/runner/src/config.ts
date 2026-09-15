const DEFAULT_POLL_INTERVAL_MS = 5000;

export interface RunnerConfig {
  dataDir: string;
  pythonBin: string;
  pollIntervalMs: number;
}

export class RunnerConfigError extends Error {}

/**
 * Reads runner configuration from the environment. DATA_DIR and
 * TRANSCRIBER_PYTHON_BIN have no sensible default (both are deployment-
 * specific paths) and are required; the poll interval defaults to 5s per
 * the locked Phase 4 decision and falls back to that default on invalid
 * input rather than failing startup.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): RunnerConfig {
  const dataDir = env.DATA_DIR;
  if (!dataDir || dataDir.trim() === "") {
    throw new RunnerConfigError("DATA_DIR environment variable is required");
  }

  const pythonBin = env.TRANSCRIBER_PYTHON_BIN;
  if (!pythonBin || pythonBin.trim() === "") {
    throw new RunnerConfigError(
      "TRANSCRIBER_PYTHON_BIN environment variable is required " +
        "(path to packages/transcriber's virtualenv python executable, e.g. " +
        "packages/transcriber/.venv/bin/python)",
    );
  }

  let pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  const rawInterval = env.RUNNER_POLL_INTERVAL_MS;
  if (rawInterval) {
    const parsed = Number(rawInterval);
    if (Number.isFinite(parsed) && parsed > 0) {
      pollIntervalMs = parsed;
    }
  }

  return { dataDir, pythonBin, pollIntervalMs };
}
