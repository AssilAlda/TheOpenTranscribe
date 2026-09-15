import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { eq, jobs } from "@theopentranscribe/db";

import { GET, POST } from "../../app/api/jobs/route";
import { getWebDb, resetWebDbCacheForTests } from "@/lib/db";

const BOUNDARY = "----routeTestBoundary";

function validWavBytes(size = 512): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + size, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.write("data", 36);
  return Buffer.concat([header, Buffer.alloc(size, 0)]);
}

function uploadRequest(filename: string, fileBytes: Buffer, language?: string): Request {
  const parts: Buffer[] = [];
  if (language !== undefined) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\nContent-Disposition: form-data; name="language"\r\n\r\n${language}\r\n`,
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    ),
  );
  parts.push(fileBytes);
  parts.push(Buffer.from(`\r\n--${BOUNDARY}--\r\n`));
  const body = new Uint8Array(Buffer.concat(parts));

  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    body,
  });
}

let dataDir: string;
let originalDataDir: string | undefined;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-web-route-jobs-"));
  originalDataDir = process.env.DATA_DIR;
  process.env.DATA_DIR = dataDir;
  resetWebDbCacheForTests();
});

afterEach(() => {
  resetWebDbCacheForTests();
  process.env.DATA_DIR = originalDataDir;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("POST /api/jobs", () => {
  it("returns 201 with a QUEUED JobDocumentLike on success", async () => {
    const res = await POST(uploadRequest("sample.wav", validWavBytes(), "en"));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.status).toBe("QUEUED");
    expect(body.data.input.language).toBe("en");
  });

  it("returns a 415 error envelope for a disallowed extension", async () => {
    const res = await POST(uploadRequest("sample.exe", validWavBytes()));
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error.code).toBe("unsupported_extension");
  });
});

describe("GET /api/jobs", () => {
  it("returns an empty paginated list when there are no jobs", async () => {
    const res = await GET(new Request("http://localhost/api/jobs"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual([]);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 0 });
  });

  it("lists created jobs, newest first, with correct pagination metadata", async () => {
    await POST(uploadRequest("a.wav", validWavBytes()));
    await new Promise((r) => setTimeout(r, 5));
    await POST(uploadRequest("b.wav", validWavBytes()));

    const res = await GET(new Request("http://localhost/api/jobs?limit=1"));
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].input.media_path).toMatch(/__b\.wav$/);
    expect(body.pagination).toEqual({ limit: 1, offset: 0, total: 2 });
  });

  it("returns a 400 error envelope for an invalid limit", async () => {
    const res = await GET(new Request("http://localhost/api/jobs?limit=0"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("invalid_pagination");
  });

  it("orders deterministically even when created_at ties (job_id secondary sort)", async () => {
    const res1 = await POST(uploadRequest("a.wav", validWavBytes()));
    const res2 = await POST(uploadRequest("b.wav", validWavBytes()));
    const jobA = (await res1.json()).data;
    const jobB = (await res2.json()).data;

    // Force an identical created_at on both rows -- the realistic tie
    // scenario (two jobs created within the same millisecond).
    const { db } = getWebDb();
    const tiedTimestamp = "2026-01-01T00:00:00.000Z";
    db.update(jobs).set({ createdAt: tiedTimestamp }).where(eq(jobs.jobId, jobA.job_id)).run();
    db.update(jobs).set({ createdAt: tiedTimestamp }).where(eq(jobs.jobId, jobB.job_id)).run();

    const orderings = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const res = await GET(new Request("http://localhost/api/jobs"));
      const body = await res.json();
      orderings.add(body.data.map((d: { job_id: string }) => d.job_id).join(","));
    }
    expect(orderings.size).toBe(1);
  });
});
