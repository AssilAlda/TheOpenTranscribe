import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { jobs, openDb, type DbClient } from "@theopentranscribe/db";

import { ApiError } from "@/lib/http";
import { createJobFromUpload } from "@/lib/upload/createJob";

const BOUNDARY = "----createJobTestBoundary";

function validWavBytes(size = 2048): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + size, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.write("data", 36);
  return Buffer.concat([header, Buffer.alloc(size, 0)]);
}

function buildMultipartBody(opts: {
  filename: string;
  fileBytes: Buffer;
  language?: string;
}): Buffer {
  const parts: Buffer[] = [];
  if (opts.language !== undefined) {
    parts.push(
      Buffer.from(
        `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="language"\r\n\r\n` +
          `${opts.language}\r\n`,
        "utf8",
      ),
    );
  }
  parts.push(
    Buffer.from(
      `--${BOUNDARY}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${opts.filename}"\r\n` +
        `Content-Type: application/octet-stream\r\n\r\n`,
      "utf8",
    ),
  );
  parts.push(opts.fileBytes);
  parts.push(Buffer.from(`\r\n--${BOUNDARY}--\r\n`, "utf8"));
  return Buffer.concat(parts);
}

function makeRequest(body: Buffer): Request {
  const bodyCopy = new Uint8Array(body);
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers: { "content-type": `multipart/form-data; boundary=${BOUNDARY}` },
    body: bodyCopy,
  });
}

let dataDir: string;
let db: DbClient;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-web-createjob-"));
  db = openDb(dataDir);
});

afterEach(() => {
  db.$client.close();
  rmSync(dataDir, { recursive: true, force: true });
});

function uploadsDirEntries(): string[] {
  const dir = join(dataDir, "uploads");
  return existsSync(dir) ? readdirSync(dir) : [];
}

describe("createJobFromUpload", () => {
  it("creates a QUEUED job and finalizes the upload on success", async () => {
    const body = buildMultipartBody({
      filename: "sample.wav",
      fileBytes: validWavBytes(),
      language: "en",
    });
    const doc = await createJobFromUpload(makeRequest(body), { db, dataDir });

    expect(doc.status).toBe("QUEUED");
    expect(doc.input.language).toBe("en");
    expect(doc.input.media_path).toBe(`uploads/${doc.job_id}__sample.wav`);
    expect(doc.result).toBeNull();
    expect(doc.error).toBeNull();

    const entries = uploadsDirEntries();
    expect(entries).toEqual([`${doc.job_id}__sample.wav`]);

    const [row] = db.select().from(jobs).all();
    expect(row?.jobId).toBe(doc.job_id);
  });

  it("creates a job without a language field (optional)", async () => {
    const body = buildMultipartBody({ filename: "sample.wav", fileBytes: validWavBytes() });
    const doc = await createJobFromUpload(makeRequest(body), { db, dataDir });
    expect(doc.input.language).toBeUndefined();
  });

  it("rejects a disallowed extension and leaves no temp file or DB row", async () => {
    const body = buildMultipartBody({ filename: "sample.exe", fileBytes: validWavBytes() });

    await expect(createJobFromUpload(makeRequest(body), { db, dataDir })).rejects.toMatchObject({
      status: 415,
      code: "unsupported_extension",
    });

    expect(uploadsDirEntries()).toHaveLength(0);
    expect(db.select().from(jobs).all()).toHaveLength(0);
  });

  it("rejects a signature mismatch and leaves no temp file or DB row", async () => {
    const body = buildMultipartBody({
      filename: "sample.wav",
      fileBytes: Buffer.from("this is not a wav file at all, just text"),
    });

    await expect(createJobFromUpload(makeRequest(body), { db, dataDir })).rejects.toMatchObject({
      status: 415,
      code: "signature_mismatch",
    });

    expect(uploadsDirEntries()).toHaveLength(0);
    expect(db.select().from(jobs).all()).toHaveLength(0);
  });

  it("rejects an empty language field and leaves no temp file or DB row", async () => {
    const body = buildMultipartBody({
      filename: "sample.wav",
      fileBytes: validWavBytes(),
      language: "",
    });

    await expect(createJobFromUpload(makeRequest(body), { db, dataDir })).rejects.toMatchObject({
      status: 400,
      code: "invalid_language",
    });

    expect(uploadsDirEntries()).toHaveLength(0);
    expect(db.select().from(jobs).all()).toHaveLength(0);
  });

  it("cleans up the finalized file if the DB insert fails after rename", async () => {
    const body = buildMultipartBody({ filename: "sample.wav", fileBytes: validWavBytes() });

    // Force the DB insert to fail by closing the underlying connection --
    // simulates "file write succeeded, DB insert failed".
    const brokenDb = {
      insert: () => {
        throw new Error("simulated DB failure");
      },
    } as unknown as DbClient;

    await expect(
      createJobFromUpload(makeRequest(body), { db: brokenDb, dataDir }),
    ).rejects.toMatchObject({ status: 500, code: "job_creation_failed" });

    // No orphaned final file, and (since we never wrote via the real db) no
    // job row could exist either.
    expect(uploadsDirEntries()).toHaveLength(0);
  });

  it("propagates ApiError instances rather than wrapping them", async () => {
    const body = buildMultipartBody({ filename: "sample.exe", fileBytes: validWavBytes() });
    await expect(createJobFromUpload(makeRequest(body), { db, dataDir })).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});
