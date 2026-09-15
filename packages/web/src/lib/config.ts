export class WebConfigError extends Error {}

export interface WebConfig {
  dataDir: string;
}

/**
 * Reads Phase 5 web API configuration from the environment. DATA_DIR has no
 * sensible default (deployment-specific) and is required, matching the same
 * requirement already imposed by packages/db and packages/runner.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const dataDir = env.DATA_DIR;
  if (!dataDir || dataDir.trim() === "") {
    throw new WebConfigError("DATA_DIR environment variable is required");
  }
  return { dataDir };
}
