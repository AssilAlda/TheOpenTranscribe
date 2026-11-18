import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * The `jobs` table is a single normalized table whose columns map directly
 * onto the JobDocument fields (packages/contract, job.v1.schema.json).
 * No separate input/result/error tables, no JSON blob column — every
 * contract field is its own column, by design.
 */
export const jobs = sqliteTable(
  "jobs",
  {
    jobId: text("job_id").primaryKey(),
    schemaVersion: integer("schema_version").notNull(),
    status: text("status").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),

    inputMediaPath: text("input_media_path").notNull(),
    inputLanguage: text("input_language"),

    resultOutputPath: text("result_output_path"),
    resultCompletedAt: text("result_completed_at"),

    errorMessage: text("error_message"),
    errorOccurredAt: text("error_occurred_at"),
  },
  (table) => [
    check(
      "status_valid",
      sql`${table.status} IN ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    ),
    // result_* columns are both set only when COMPLETED, both null otherwise —
    // mirrors the contract's "result is required-but-null unless COMPLETED".
    check(
      "result_matches_status",
      sql`(
        (${table.status} = 'COMPLETED'
          AND ${table.resultOutputPath} IS NOT NULL
          AND ${table.resultCompletedAt} IS NOT NULL)
        OR
        (${table.status} != 'COMPLETED'
          AND ${table.resultOutputPath} IS NULL
          AND ${table.resultCompletedAt} IS NULL)
      )`,
    ),
    // error_* columns are both set only when FAILED, both null otherwise —
    // mirrors the contract's "error is required-but-null unless FAILED".
    check(
      "error_matches_status",
      sql`(
        (${table.status} = 'FAILED'
          AND ${table.errorMessage} IS NOT NULL
          AND ${table.errorOccurredAt} IS NOT NULL)
        OR
        (${table.status} != 'FAILED'
          AND ${table.errorMessage} IS NULL
          AND ${table.errorOccurredAt} IS NULL)
      )`,
    ),
    // The runner needs to find QUEUED jobs; job history (this package's own
    // "queryable history" responsibility, and the dashboard) needs recency
    // order.
    index("idx_jobs_status").on(table.status),
    index("idx_jobs_created_at").on(table.createdAt),
  ],
);

export type JobRow = typeof jobs.$inferSelect;
export type NewJobRow = typeof jobs.$inferInsert;
