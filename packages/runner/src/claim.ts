import { and, eq, jobs, sql, type DbClient, type JobRow } from "@theopentranscribe/db";

/**
 * Atomically claims the oldest QUEUED job and transitions it to PROCESSING
 * in one statement: the WHERE clause re-checks status = 'QUEUED' against the
 * row chosen by the subquery, so if another writer already claimed it first,
 * this UPDATE matches zero rows instead of double-claiming the same row.
 *
 * This is defense in depth against the narrow double-claim race (two
 * connections racing this exact statement at the same instant) — it is NOT
 * a general guarantee that running two runner processes against the same
 * DATA_DIR is safe. It is not: see recoverStaleProcessingJobs below.
 * Exactly one runner process must run against a given DATA_DIR at a time.
 *
 * Ownership of this query lives in the runner, not packages/db, per
 * packages/db's "does not own runner polling/execution" boundary.
 */
export function claimNextQueuedJob(db: DbClient): JobRow | undefined {
  const now = new Date().toISOString();

  const claimed = db
    .update(jobs)
    .set({ status: "PROCESSING", updatedAt: now })
    .where(
      and(
        eq(jobs.status, "QUEUED"),
        eq(
          jobs.jobId,
          sql`(SELECT job_id FROM jobs WHERE status = 'QUEUED' ORDER BY created_at ASC LIMIT 1)`,
        ),
      ),
    )
    .returning()
    .all();

  return claimed[0];
}

/**
 * Transitions PROCESSING -> COMPLETED. Guarded by `status = 'PROCESSING'` so
 * a subprocess result can never overwrite a job that has already moved on
 * (e.g. a startup recovery sweep already marked it FAILED). Returns false
 * (a no-op) instead of throwing if the guard didn't match, so a caller can
 * log the situation rather than silently trusting a stale write.
 */
export function markCompleted(db: DbClient, jobId: string, resultOutputPath: string): boolean {
  const now = new Date().toISOString();
  const updated = db
    .update(jobs)
    .set({
      status: "COMPLETED",
      updatedAt: now,
      resultOutputPath,
      resultCompletedAt: now,
    })
    .where(and(eq(jobs.jobId, jobId), eq(jobs.status, "PROCESSING")))
    .returning({ jobId: jobs.jobId })
    .all();
  return updated.length > 0;
}

/**
 * Transitions PROCESSING -> FAILED. Same PROCESSING guard and same
 * no-op-instead-of-overwrite behavior as markCompleted above.
 */
export function markFailed(db: DbClient, jobId: string, errorMessage: string): boolean {
  const now = new Date().toISOString();
  const updated = db
    .update(jobs)
    .set({
      status: "FAILED",
      updatedAt: now,
      errorMessage,
      errorOccurredAt: now,
    })
    .where(and(eq(jobs.jobId, jobId), eq(jobs.status, "PROCESSING")))
    .returning({ jobId: jobs.jobId })
    .all();
  return updated.length > 0;
}
