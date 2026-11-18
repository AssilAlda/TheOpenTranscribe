import { eq, jobs, resolveWithinDataDir } from "@theopentranscribe/db";
import { readFile, stat } from "node:fs/promises";

import { getWebDb } from "@/lib/db";
import { apiErrorToResponse, ApiError } from "@/lib/http";
import { isValidJobId } from "@/lib/jobId";
import { buildContentDisposition, buildTranscriptPdfFilename } from "@/lib/pdf/filename";
import {
  generateTranscriptPdf,
  UnsupportedTranscriptCharactersError,
} from "@/lib/pdf/generateTranscriptPdf";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

/**
 * GET /api/jobs/:jobId/result/pdf -- a professional, on-demand PDF export of
 * the completed transcript. Purely additive to the jobs API: does not
 * modify GET /api/jobs/:jobId/result or any existing route/contract. The
 * generated PDF is never persisted -- it exists only as this response body.
 */
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

    const transcript = await readFile(outputPath, "utf-8");
    const filename = buildTranscriptPdfFilename(row.inputMediaPath);
    const title = filename.replace(/\.pdf$/, "");

    let pdf: Buffer;
    try {
      pdf = await generateTranscriptPdf(transcript, title, {
        sourceFilename: filename !== "transcript.pdf" ? filename.replace(/\.pdf$/, "") : undefined,
        completedAt: row.resultCompletedAt ?? row.updatedAt,
        language: row.inputLanguage ?? undefined,
      });
    } catch (err) {
      if (err instanceof UnsupportedTranscriptCharactersError) {
        throw new ApiError(
          422,
          "unsupported_pdf_characters",
          "This transcript contains characters that can't be exported to PDF yet.",
        );
      }
      throw err;
    }

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": buildContentDisposition(filename),
      },
    });
  } catch (err) {
    return apiErrorToResponse(err);
  }
}
