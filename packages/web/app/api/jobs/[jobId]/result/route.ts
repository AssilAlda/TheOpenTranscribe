import { eq, jobs, resolveWithinDataDir } from "@theopentranscribe/db";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { getWebDb } from "@/lib/db";
import { apiErrorToResponse, ApiError } from "@/lib/http";
import { isValidJobId } from "@/lib/jobId";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

/** GET /api/jobs/:jobId/result -- the completed transcript as text/plain. */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { jobId } = await context.params;
    if (!isValidJobId(jobId)) {
      throw new ApiError(400, "invalid_job_id", "job_id is not a valid UUID.");
    }

    const { db, dataDir } = getWebDb();
    const [row] = db.select().from(jobs).where(eq(jobs.jobId, jobId)).all();
    if (!row) {
      throw new ApiError(404, "job_not_found", `No job found with id ${jobId}.`);
    }
    if (row.status !== "COMPLETED" || !row.resultOutputPath) {
      throw new ApiError(
        409,
        "job_not_completed",
        `Job ${jobId} is not completed (current status: ${row.status}).`,
      );
    }

    const outputPath = resolveWithinDataDir(dataDir, row.resultOutputPath);
    try {
      await stat(outputPath);
    } catch {
      throw new ApiError(500, "result_file_missing", "The job is COMPLETED but its result file is missing.");
    }

    const stream = Readable.toWeb(createReadStream(outputPath)) as ReadableStream;
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return apiErrorToResponse(err);
  }
}
