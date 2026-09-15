import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { dbFilePath, ensureDataDirLayout } from "./paths.js";
import * as schema from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_FOLDER = resolve(__dirname, "..", "drizzle");

export type DbClient = ReturnType<typeof drizzle<typeof schema>>;

export interface OpenDbOptions {
  /** Run pending migrations immediately after opening. Defaults to true. */
  runMigrations?: boolean;
}

/**
 * Opens (creating if needed) the Phase 3 SQLite database at
 * DATA_DIR/theopentranscribe.sqlite3, enables WAL mode, and returns a
 * Drizzle client bound to the Phase 3 schema.
 *
 * WAL is a durable, per-database-file setting (SQLite persists it in the
 * file header), but is asserted on every open rather than assumed, since a
 * database file could in principle have been created elsewhere without it.
 */
export function openDb(dataDir: string, options: OpenDbOptions = {}): DbClient {
  const { runMigrations = true } = options;
  const root = ensureDataDirLayout(dataDir);
  const filePath = dbFilePath(root);

  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  const actualJournalMode = sqlite.pragma("journal_mode", { simple: true });
  if (actualJournalMode !== "wal") {
    sqlite.close();
    throw new Error(
      `Failed to enable WAL mode for ${filePath} (got journal_mode=${String(
        actualJournalMode,
      )}). WAL requires a local filesystem; DATA_DIR may be on an unsupported network mount.`,
    );
  }

  const db = drizzle(sqlite, { schema });

  if (runMigrations) {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }

  return db;
}
