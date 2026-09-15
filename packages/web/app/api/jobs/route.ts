import { desc, jobs, rowToJobDocument, sql } from "@theopentranscribe/db";

import { getWebDb } from "@/lib/db";
import { apiErrorToResponse, dataResponse } from "@/lib/http";
import { parsePagination } from "@/lib/pagination";
import { createJobFromUpload } from "@/lib/upload/createJob";

// Locked at Phase 5 phase start (docs/ARCHITECTURE.md §15): the upload path
// streams the multipart body via @fastify/busboy and must run in the
// Node.js runtime, never Edge.
export const runtime = "nodejs";

/** POST /api/jobs -- upload a media file and create a QUEUED job. */
export async function POST(request: Request): Promise<Response> {
  try {
    const { db, dataDir } = getWebDb();
    const doc = await createJobFromUpload(request, { db, dataDir });
    return dataResponse(doc, 201);
  } catch (err) {
    return apiErrorToResponse(err);
  }
}

/** GET /api/jobs?limit=&offset= -- paginated job history, newest first. */
export async function GET(request: Request): Promise<Response> {
  try {
    const { db } = getWebDb();
    const { searchParams } = new URL(request.url);
    const { limit, offset } = parsePagination(searchParams);

    // job_id is a secondary, deterministic tiebreaker: created_at has only
    // millisecond resolution, so two jobs created in the same millisecond
    // would otherwise have an undefined relative order across pages.
    const rows = db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt), jobs.jobId)
      .limit(limit)
      .offset(offset)
      .all();
    const totalRow = db.select({ total: sql<number>`count(*)` }).from(jobs).all()[0];
    const total = totalRow?.total ?? 0;

    return Response.json(
      { data: rows.map(rowToJobDocument), pagination: { limit, offset, total } },
      { status: 200 },
    );
  } catch (err) {
    return apiErrorToResponse(err);
  }
}
