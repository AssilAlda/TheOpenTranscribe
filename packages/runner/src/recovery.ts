import { eq, jobs, type DbClient } from "@theopentranscribe/db";

export const STALE_PROCESSING_REASON =
  "runner restarted while job was PROCESSING; not auto-retried " +
  "(the previous process may already have reached the transcription provider " +
  "and incurred cost) — see docs/ARCHITECTURE.md §7";

/**
 * Locked Phase 4 recovery semantics (docs/ARCHITECTURE.md §7): on runner
 * startup, every row still PROCESSING is treated as orphaned and is
 * unconditionally marked FAILED with an explicit reason, with no way to
 * distinguish "actually orphaned" from "another runner process is
 * legitimately processing it right now". Never auto-retried; a
 * user-triggered retry must create a new QUEUED job elsewhere.
 *
 * This unconditional sweep is only correct under the operational invariant
 * that exactly one runner process runs against a given DATA_DIR at a time.
 * If a second runner process is started against the same DATA_DIR while a
 * first one is actively processing a job, this sweep WILL mark that
 * actively-running job FAILED out from under the first process — the atomic
 * claim (claim.ts) only prevents two processes from claiming the *same* row
 * at the *same* instant; it does not make concurrent runner processes safe
 * in general. Running more than one runner process per DATA_DIR is
 * unsupported in Phase 4, not merely discouraged.
 */
export function recoverStaleProcessingJobs(db: DbClient): number {
  const now = new Date().toISOString();

  const recovered = db
    .update(jobs)
    .set({
      status: "FAILED",
      updatedAt: now,
      errorMessage: STALE_PROCESSING_REASON,
      errorOccurredAt: now,
    })
    .where(eq(jobs.status, "PROCESSING"))
    .returning({ jobId: jobs.jobId })
    .all();

  return recovered.length;
}
