import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/upload/constants";
import { parseMultipartUpload } from "@/lib/upload/parseMultipart";

const BOUNDARY = "----testBoundary123";

function multipartHeader(filename: string, language?: string): string {
  let out = "";
  if (language !== undefined) {
    out +=
      `--${BOUNDARY}\r\n` +
      `Content-Disposition: form-data; name="language"\r\n\r\n` +
      `${language}\r\n`;
  }
  out +=
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`;
  return out;
}

function multipartFooter(): string {
  return `\r\n--${BOUNDARY}--\r\n`;
}

/** Produces a multipart body as an async generator so we can observe how
 * many file-content chunks a consumer actually pulls before stopping. */
function makeBodyGenerator(opts: {
  filename: string;
  language?: string;
  totalChunks: number;
  chunkSize: number;
  state: { chunksProduced: number; reachedFooter: boolean };
  onChunk?: (chunkIndex: number) => void;
}) {
  const { filename, language, totalChunks, chunkSize, state, onChunk } = opts;
  return (async function* () {
    yield Buffer.from(multipartHeader(filename, language), "utf8");
    for (let i = 0; i < totalChunks; i++) {
      state.chunksProduced = i + 1;
      yield Buffer.alloc(chunkSize, 0x41);
      onChunk?.(i);
      await new Promise((r) => setImmediate(r));
    }
    yield Buffer.from(multipartFooter(), "utf8");
    state.reachedFooter = true;
  })();
}

function toWebReadableStream(asyncGen: AsyncGenerator<Buffer>): ReadableStream {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await asyncGen.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      await asyncGen.return(undefined);
    },
  });
}

function makeRequest(
  body: ReadableStream,
  contentLength?: number,
  signal?: AbortSignal,
): Request {
  const headers: Record<string, string> = {
    "content-type": `multipart/form-data; boundary=${BOUNDARY}`,
  };
  if (contentLength !== undefined) headers["content-length"] = String(contentLength);
  return new Request("http://localhost/api/jobs", {
    method: "POST",
    headers,
    body,
    duplex: "half",
    signal,
  } as RequestInit);
}

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "totr-web-parsemultipart-"));
});

afterEach(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("parseMultipartUpload", () => {
  it("streams a within-limit file + language field cleanly", async () => {
    const state = { chunksProduced: 0, reachedFooter: false };
    const gen = makeBodyGenerator({
      filename: "sample.wav",
      language: "en",
      totalChunks: 2,
      chunkSize: 1024,
      state,
    });
    const request = makeRequest(toWebReadableStream(gen));

    const result = await parseMultipartUpload(request, "job-1", dataDir);

    expect(result.originalFilename).toBe("sample.wav");
    expect(result.language).toBe("en");
    expect(result.fileBytesWritten).toBe(2048);
    expect(existsSync(result.tempFilePath)).toBe(true);
    expect(readFileSync(result.tempFilePath)).toHaveLength(2048);
    expect(state.reachedFooter).toBe(true);
  });

  it("stops mid-stream on an oversized file without materializing the full body", async () => {
    const chunkSize = 5 * 1024 * 1024; // 5 MiB
    const totalChunks = Math.ceil((MAX_UPLOAD_BYTES + 20 * 1024 * 1024) / chunkSize); // well over the limit
    const state = { chunksProduced: 0, reachedFooter: false };
    const gen = makeBodyGenerator({
      filename: "big.wav",
      totalChunks,
      chunkSize,
      state,
    });
    const request = makeRequest(toWebReadableStream(gen));

    await expect(parseMultipartUpload(request, "job-oversized", dataDir)).rejects.toMatchObject({
      status: 413,
      code: "file_too_large",
    });

    // Genuine streaming/backpressure: the source must NOT have been fully
    // drained before we stopped consuming it.
    expect(state.reachedFooter).toBe(false);
    expect(state.chunksProduced).toBeLessThan(totalChunks);

    // No orphaned temp file left behind by the size-limit rejection.
    const uploadsDir = join(dataDir, "uploads");
    const leftovers = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];
    expect(leftovers).toHaveLength(0);
  });

  it("rejects a request with no file part", async () => {
    const gen = (async function* () {
      yield Buffer.from(`--${BOUNDARY}--\r\n`, "utf8");
    })();
    const request = makeRequest(toWebReadableStream(gen));

    await expect(parseMultipartUpload(request, "job-2", dataDir)).rejects.toMatchObject({
      status: 400,
      code: "missing_file",
    });
  });

  it("rejects a duplicate file field and cleans up the first file's temp file", async () => {
    const gen = (async function* () {
      yield Buffer.from(
        multipartHeader("first.wav") +
          Buffer.alloc(10, 0x41).toString("binary") +
          `\r\n--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="file"; filename="second.wav"\r\n` +
          `Content-Type: audio/wav\r\n\r\n` +
          Buffer.alloc(10, 0x42).toString("binary") +
          multipartFooter(),
        "binary",
      );
    })();
    const request = makeRequest(toWebReadableStream(gen));

    await expect(parseMultipartUpload(request, "job-dup-file", dataDir)).rejects.toMatchObject({
      status: 400,
      code: "too_many_files",
    });

    const uploadsDir = join(dataDir, "uploads");
    const leftovers = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];
    expect(leftovers).toHaveLength(0);
  });

  it("rejects a malformed multipart body (parser error)", async () => {
    // No boundary markers at all -- busboy's own parser should error out
    // rather than silently treating this as an empty/valid body.
    const gen = (async function* () {
      yield Buffer.from("this is not multipart data at all, no boundaries here\r\n", "utf8");
    })();
    const request = makeRequest(toWebReadableStream(gen));

    await expect(parseMultipartUpload(request, "job-malformed", dataDir)).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it("rejects an unexpected extra field", async () => {
    const gen = (async function* () {
      yield Buffer.from(
        `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="bogus"\r\n\r\n` +
          `x\r\n` +
          multipartHeader("sample.wav") +
          Buffer.alloc(10, 0x41).toString("binary") +
          multipartFooter(),
        "binary",
      );
    })();
    const request = makeRequest(toWebReadableStream(gen));

    await expect(parseMultipartUpload(request, "job-3", dataDir)).rejects.toMatchObject({
      status: 400,
      code: "unexpected_field",
    });
  });

  it("rejects a duplicate language field", async () => {
    const gen = (async function* () {
      yield Buffer.from(
        `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="language"\r\n\r\n` +
          `en\r\n` +
          `--${BOUNDARY}\r\n` +
          `Content-Disposition: form-data; name="language"\r\n\r\n` +
          `sv\r\n` +
          multipartHeader("sample.wav") +
          Buffer.alloc(10, 0x41).toString("binary") +
          multipartFooter(),
        "binary",
      );
    })();
    const request = makeRequest(toWebReadableStream(gen));

    await expect(parseMultipartUpload(request, "job-3b", dataDir)).rejects.toMatchObject({
      status: 400,
      code: "duplicate_field",
    });
  });

  it("rejects immediately if the request signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const gen = makeBodyGenerator({
      filename: "sample.wav",
      totalChunks: 1,
      chunkSize: 16,
      state: { chunksProduced: 0, reachedFooter: false },
    });
    const request = makeRequest(toWebReadableStream(gen), undefined, controller.signal);

    await expect(parseMultipartUpload(request, "job-abort-1", dataDir)).rejects.toMatchObject({
      status: 400,
      code: "client_aborted",
    });
  });

  it("cleans up and rejects when the client disconnects mid-upload", async () => {
    const chunkSize = 1024;
    const totalChunks = 20;
    const state = { chunksProduced: 0, reachedFooter: false };
    const controller = new AbortController();
    // Deterministic: abort exactly after the 2nd chunk has been produced,
    // rather than racing a wall-clock timeout against the stream.
    const gen = makeBodyGenerator({
      filename: "sample.wav",
      totalChunks,
      chunkSize,
      state,
      onChunk: (i) => {
        if (i === 1) controller.abort();
      },
    });
    const request = makeRequest(toWebReadableStream(gen), undefined, controller.signal);

    const pending = parseMultipartUpload(request, "job-abort-2", dataDir);

    await expect(pending).rejects.toMatchObject({ status: 400, code: "client_aborted" });
    expect(state.chunksProduced).toBeLessThan(totalChunks);

    const uploadsDir = join(dataDir, "uploads");
    const leftovers = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];
    expect(leftovers).toHaveLength(0);
  });

  it("rejects a non-multipart content-type", async () => {
    const request = new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    await expect(parseMultipartUpload(request, "job-4", dataDir)).rejects.toMatchObject({
      status: 400,
      code: "invalid_content_type",
    });
  });

  it("rejects via the Content-Length early-check before ever writing a temp file", async () => {
    // A bare ReadableStream calls pull() once on construction to fill its
    // own internal buffer (WHATWG streams spec default, independent of any
    // consumer) -- that isn't this function "reading the body". The
    // meaningful guarantee is that parseMultipartUpload never gets as far
    // as Readable.fromWeb/busboy/createWriteStream, i.e. no temp file.
    const stream = new ReadableStream({
      pull(controller) {
        controller.enqueue(Buffer.from("should not be parsed"));
      },
    });
    const request = makeRequest(stream, MAX_UPLOAD_BYTES + 1);

    await expect(parseMultipartUpload(request, "job-5", dataDir)).rejects.toMatchObject({
      status: 413,
      code: "file_too_large",
    });

    const uploadsDir = join(dataDir, "uploads");
    const leftovers = existsSync(uploadsDir) ? readdirSync(uploadsDir) : [];
    expect(leftovers).toHaveLength(0);
  });

  it("never leaks the DATA_DIR absolute path in a temp-file write-error message", async () => {
    const gen = makeBodyGenerator({
      filename: "sample.wav",
      totalChunks: 1,
      chunkSize: 16,
      state: { chunksProduced: 0, reachedFooter: false },
    });
    const request = makeRequest(toWebReadableStream(gen));

    // Force createWriteStream() to fail with a real fs error (permission
    // denied) by making uploads/ read-only, so the caught error is a real
    // Node fs.WriteStream error whose default .message embeds the absolute
    // path -- exactly the case this guards against.
    const uploadsDir = join(dataDir, "uploads");
    mkdirSync(uploadsDir, { recursive: true });
    chmodSync(uploadsDir, 0o444);
    try {
      const rejection = await parseMultipartUpload(request, "job-writeerr", dataDir).catch(
        (e) => e,
      );
      expect(rejection).toBeInstanceOf(ApiError);
      expect(rejection.status).toBe(500);
      expect(rejection.code).toBe("temp_file_write_error");
      expect(rejection.message).not.toContain(dataDir);
      expect(rejection.message).not.toMatch(/\//); // no path-like content at all
    } finally {
      chmodSync(uploadsDir, 0o755);
    }
  });

  it("throws ApiError instances (not plain errors) on failure", async () => {
    const request = new Request("http://localhost/api/jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    await expect(parseMultipartUpload(request, "job-6", dataDir)).rejects.toBeInstanceOf(ApiError);
  });
});
