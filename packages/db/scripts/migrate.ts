/**
 * Applies pending migrations against DATA_DIR/theopentranscribe.sqlite3.
 * Usage (from packages/db): DATA_DIR=/path/to/data npm run db:migrate
 */
import { openDb } from "../src/client.js";

const dataDir = process.env.DATA_DIR;
if (!dataDir) {
  console.error("DATA_DIR environment variable is required");
  process.exit(1);
}

openDb(dataDir, { runMigrations: true });
console.log(`Migrations applied to ${dataDir}`);
