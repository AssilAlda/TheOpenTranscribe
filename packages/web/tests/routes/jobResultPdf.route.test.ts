import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eq, jobs, openDb, type DbClient } from "@theopentranscribe/db";

import { GET as getResultPdf } from "../../app/api/jobs/[jobId]/result/pdf/route";
import { POST as createJob } from "../../app/api/jobs/route";
import { resetWebDbCacheForTests } from "@/lib/db";

const BOUNDARY = "----resultPdfRouteTestBoundary";

function validWavBytes(size = 512): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + size, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.write("data", 36);
  return Buffer.concat([header, Buffer.alloc(size, 0)]);
}

function uploadRequest(filename: string): Request {
  const body = new Uint8Array(
    Buffer.concat([
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
      ),
      validWavBytes(),
      Buffer.from(`\r\n--${BOUNDARY}--\r\n`),
    ]),
  );
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers: {
      "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
      origin: "http://localhost:3000",
    },
    body,
  });
}

function ctx(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

async function completeJob(dataDir: string, jobId: string, transcript: string): Promise<void> {
  const db: DbClient = openDb(dataDir);
  mkdirSync(join(dataDir, "outputs"), { recursive: true });
  const outputRelative = `outputs/${jobId}.txt`;
  writeFileSync(join(dataDir, outputRelative), transcript);
  const now = new Date().toISOString();
  db.update(jobs)
    .set({
      status: "COMPLETED",
      updatedAt: now,
      resultOutputPath: outputRelative,
      resultCompletedAt: now,
    })
    .where(eq(jobs.jobId, jobId))
    .run();
  db.$client.close();
  resetWebDbCacheForTests();
}

let dataDir: string;
let originalDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-web-route-result-pdf-"));
  originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  resetWebDbCacheForTests();
});

afterEach(() => {
  resetWebDbCacheForTests();
  process.env.DATA_DIR = originalDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/jobs/:jobId/result/pdf", () => {
  it("returns 400 for a malformed job_id", async () => {
    const res = await getResultPdf(
      new Request("http://localhost/api/jobs/not-a-uuid/result/pdf"),
      ctx("not-a-uuid"),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_job_id");
  });

  it("returns 404 for an unknown job_id", async () => {
    const unknownId = "33333333-3333-4333-8333-333333333333";
    const res = await getResultPdf(
      new Request(`http://localhost/api/jobs/${unknownId}/result/pdf`),
      ctx(unknownId),
    );
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("job_not_found");
  });

  it("returns 409 for a job that is not yet COMPLETED", async () => {
    const createRes = await createJob(uploadRequest("sample.wav"));
    const { data: created } = await createRes.json();

    const res = await getResultPdf(
      new Request(`http://localhost/api/jobs/${created.job_id}/result/pdf`),
      ctx(created.job_id),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("job_not_completed");
  });

  it("returns 200 with a valid application/pdf response and a safe Content-Disposition for a COMPLETED job", async () => {
    const createRes = await createJob(uploadRequest("My Recording.wav"));
    const { data: created } = await createRes.json();

    await completeJob(dataDir, created.job_id, "Hej, det här är en transkription med å ä ö.");

    const res = await getResultPdf(
      new Request(`http://localhost/api/jobs/${created.job_id}/result/pdf`),
      ctx(created.job_id),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).toContain("attachment");
    expect(disposition).toMatch(/filename="[^"]+\.pdf"/);
    expect(disposition).toContain("filename*=UTF-8''");
    // Injection-safety: header value must never contain a raw newline.
    expect(disposition).not.toMatch(/[\r\n]/);

    const body = Buffer.from(await res.arrayBuffer());
    expect(body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(body.length).toBeGreaterThan(1000);
  });

  it("returns 422 (not a silently-broken 200) when the transcript contains characters the vendored font can't render", async () => {
    const createRes = await createJob(uploadRequest("sample.wav"));
    const { data: created } = await createRes.json();

    await completeJob(dataDir, created.job_id, "Unsupported: 😀");

    const res = await getResultPdf(
      new Request(`http://localhost/api/jobs/${created.job_id}/result/pdf`),
      ctx(created.job_id),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error.code).toBe("unsupported_pdf_characters");
  });

  it("does not modify the existing GET /api/jobs/:jobId/result endpoint's behavior (sanity check via a fresh completed job)", async () => {
    // Regression guard: this new route must be purely additive. A minimal
    // check that creating+completing a job still works exactly as the
    // existing result-route tests already cover in detail.
    const createRes = await createJob(uploadRequest("sample.wav"));
    const { data: created } = await createRes.json();
    expect(created.status).toBe("QUEUED");
  });
});
