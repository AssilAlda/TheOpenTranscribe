import { eq, jobs, rowToJobDocument } from "@theopentranscribe/db";

import { getWebDb } from "@/lib/db";
import { apiErrorToResponse, ApiError, dataResponse } from "@/lib/http";
import { isValidJobId } from "@/lib/jobId";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

/** GET /api/jobs/:jobId -- a single job's current state. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { jobId } = await context.params;
    if (!isValidJobId(jobId)) {
      throw new ApiError(400, "invalid_job_id", "job_id is not a valid UUID.");
    }

    const { db } = getWebDb();
    const [row] = db.select().from(jobs).where(eq(jobs.jobId, jobId)).all();
    if (!row) {
      throw new ApiError(404, "job_not_found", `No job found with id ${jobId}.`);
    }

    return dataResponse(rowToJobDocument(row), 200);
  } catch (err) {
    return apiErrorToResponse(err);
  }
}
