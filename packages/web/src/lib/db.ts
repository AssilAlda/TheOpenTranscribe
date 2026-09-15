import { openDb, resolveDataDir, type DbClient } from "@theopentranscribe/db";

import { loadConfig } from "./config";

interface WebDb {
  db: DbClient;
  dataDir: string;
}

let cached: WebDb | undefined;

/**
 * Lazily opens (once per process) the shared DATA_DIR SQLite connection via
 * packages/db. Route handlers call this instead of opening their own
 * connection per request.
 */
export function getWebDb(): WebDb {
  if (!cached) {
    const { dataDir } = loadConfig();
    const resolvedDataDir = resolveDataDir(dataDir);
    const db = openDb(resolvedDataDir);
    cached = { db, dataDir: resolvedDataDir };
  }
  return cached;
}

/** Test-only: forces the next getWebDb() call to open a fresh connection. */
export function resetWebDbCacheForTests(): void {
  cached = undefined;
}
