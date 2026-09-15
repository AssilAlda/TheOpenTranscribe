import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eq, jobs, openDb, type DbClient } from "@theopentranscribe/db";

import { GET as getJob } from "../../app/api/jobs/[jobId]/route";
import { GET as getResult } from "../../app/api/jobs/[jobId]/result/route";
import { POST as createJob } from "../../app/api/jobs/route";
import { resetWebDbCacheForTests } from "@/lib/db";

const BOUNDARY = "----detailRouteTestBoundary";

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
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    body,
  });
}

function ctx(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

let dataDir: string;
let originalDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-web-route-detail-"));
  originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  resetWebDbCacheForTests();
});

afterEach(() => {
  resetWebDbCacheForTests();
  process.env.DATA_DIR = originalDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("GET /api/jobs/:jobId", () => {
  it("returns 400 for a malformed job_id", async () => {
    const res = await getJob(new Request("http://localhost/api/jobs/not-a-uuid"), ctx("not-a-uuid"));
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid_job_id");
  });

  it("returns 404 for a well-formed but unknown job_id", async () => {
    const unknownId = "11111111-1111-4111-8111-111111111111";
    const res = await getJob(new Request(`http://localhost/api/jobs/${unknownId}`), ctx(unknownId));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("job_not_found");
  });

  it("returns 200 with the job document for a known job_id", async () => {
    const createRes = await createJob(uploadRequest("sample.wav"));
    const { data: created } = await createRes.json();

    const res = await getJob(
      new Request(`http://localhost/api/jobs/${created.job_id}`),
      ctx(created.job_id),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data.job_id).toBe(created.job_id);
  });
});

describe("GET /api/jobs/:jobId/result", () => {
  it("returns 400 for a malformed job_id", async () => {
    const res = await getResult(
      new Request("http://localhost/api/jobs/not-a-uuid/result"),
      ctx("not-a-uuid"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 for an unknown job_id", async () => {
    const unknownId = "22222222-2222-4222-8222-222222222222";
    const res = await getResult(
      new Request(`http://localhost/api/jobs/${unknownId}/result`),
      ctx(unknownId),
    );
    expect(res.status).toBe(404);
  });

  it("returns 409 for a job that is not yet COMPLETED", async () => {
    const createRes = await createJob(uploadRequest("sample.wav"));
    const { data: created } = await createRes.json();

    const res = await getResult(
      new Request(`http://localhost/api/jobs/${created.job_id}/result`),
      ctx(created.job_id),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("job_not_completed");
  });

  it("returns 200 with the transcript text for a COMPLETED job", async () => {
    const createRes = await createJob(uploadRequest("sample.wav"));
    const { data: created } = await createRes.json();

    // Simulate what the Phase 4 runner does on success.
    const db: DbClient = openDb(dataDir);
    mkdirSync(join(dataDir, "outputs"), { recursive: true });
    const outputRelative = `outputs/${created.job_id}.txt`;
    writeFileSync(join(dataDir, outputRelative), "the transcript");
    const now = new Date().toISOString();
    db.update(jobs)
      .set({
        status: "COMPLETED",
        updatedAt: now,
        resultOutputPath: outputRelative,
        resultCompletedAt: now,
      })
      .where(eq(jobs.jobId, created.job_id))
      .run();
    db.$client.close();
    resetWebDbCacheForTests();

    const res = await getResult(
      new Request(`http://localhost/api/jobs/${created.job_id}/result`),
      ctx(created.job_id),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(await res.text()).toBe("the transcript");
  });
});
