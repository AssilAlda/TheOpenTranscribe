import Busboy, { type BusboyFileStream } from "@fastify/busboy";
import { createWriteStream, type WriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

import { ensureDataDirLayout, resolveWithinDataDir } from "@theopentranscribe/db";

import { ApiError } from "../http";
import { MAX_UPLOAD_BYTES } from "./constants";
import { SignatureSniffer } from "./signature";
import { buildTempUploadRelativePath } from "./tempPath";

export interface ParsedUpload {
  /** Absolute path to the fully-written temp file (caller renames/deletes it). */
  tempFilePath: string;
  /** Client-supplied filename -- untrusted, used only for its extension after sanitization. */
  originalFilename: string;
  fileBytesWritten: number;
  /** Bounded leading-bytes prefix collected while streaming, for signature validation. */
  signaturePrefix: Buffer;
  language: string | undefined;
}

const MAX_FIELDS = 5;
const MAX_PARTS = MAX_FIELDS + 1; // the 5 allowed fields, plus the one file part

/**
 * Streams a POST /api/jobs multipart/form-data request straight to a temp
 * file under DATA_DIR/uploads/, never materializing the full body in memory
 * or on disk beyond what has actually arrived. Enforces the locked 100 MiB
 * limit inside the parser itself (mid-stream, not after full receipt) and
 * accepts exactly one `file` part plus zero-or-one `language` field.
 *
 * Extension/signature/language *content* validation happens in the caller
 * once this resolves -- this function only enforces upload *transport*
 * shape (part counts, size) and hands back the temp file + raw metadata.
 */
export async function parseMultipartUpload(
  request: Request,
  jobId: string,
  dataDir: string,
): Promise<ParsedUpload> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new ApiError(400, "invalid_content_type", "Expected multipart/form-data.");
  }

  // Early-rejection optimization only -- Content-Length is never treated as
  // authoritative. The real limit is enforced on the byte stream below.
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
      throw new ApiError(
        413,
        "file_too_large",
        `Upload exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`,
      );
    }
  }

  if (!request.body) {
    throw new ApiError(400, "empty_body", "Request body is required.");
  }

  if (request.signal.aborted) {
    throw new ApiError(400, "client_aborted", "The upload request was aborted by the client.");
  }

  // Defense in depth: in the real app, getWebDb() always calls openDb()
  // (which runs ensureDataDirLayout) before this is ever invoked, but this
  // function shouldn't implicitly depend on that ordering to be correct.
  ensureDataDirLayout(dataDir);
  const tempFilePath = resolveWithinDataDir(dataDir, buildTempUploadRelativePath(jobId));
  const nodeReadable = Readable.fromWeb(request.body as NodeWebReadableStream<Uint8Array>);
  const sniffer = new SignatureSniffer();

  return new Promise<ParsedUpload>((resolvePromise, rejectPromise) => {
    let settled = false;
    let sawFile = false;
    let sawLanguage = false;
    let tempFileCreated = false;
    let originalFilename: string | undefined;
    let language: string | undefined;
    let fileBytesWritten = 0;
    let writeStream: WriteStream | undefined;

    const busboy = new Busboy({
      headers: { "content-type": contentType },
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: MAX_FIELDS, parts: MAX_PARTS },
    });

    function cleanupTempFile(): Promise<void> {
      if (!tempFileCreated) return Promise.resolve();
      const doUnlink = () =>
        unlink(tempFilePath).catch(() => {
          /* best-effort: a normal error/limit path always attempts cleanup */
        });
      // fs.WriteStream opens its file descriptor asynchronously. If we're
      // called very soon after createWriteStream() (e.g. a second "file"
      // part arrives in the same tick as the first is being set up),
      // destroy() may run before the underlying open() has resolved --
      // unlinking immediately in that window can race the file's own
      // creation and miss it entirely. "close" is guaranteed to fire only
      // once teardown (including any pending open) has fully resolved, so
      // waiting for it makes the unlink race-free.
      if (writeStream && !writeStream.closed) {
        return new Promise((resolve) => {
          writeStream!.once("close", () => {
            doUnlink().finally(resolve);
          });
        });
      }
      return doUnlink();
    }

    function fail(err: ApiError): void {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener("abort", onAbort);
      nodeReadable.unpipe(busboy);
      nodeReadable.destroy();
      writeStream?.destroy();
      // Rejection is deferred until cleanup actually completes, so a caller
      // can rely on "no temp file exists" as soon as this promise rejects.
      void cleanupTempFile().finally(() => rejectPromise(err));
    }

    function succeed(): void {
      if (settled) return;
      settled = true;
      request.signal.removeEventListener("abort", onAbort);
      resolvePromise({
        tempFilePath,
        originalFilename: originalFilename!,
        fileBytesWritten,
        signaturePrefix: sniffer.prefix(),
        language,
      });
    }

    // Defense in depth for a client disconnecting mid-upload: in practice the
    // aborted body stream also surfaces as a nodeReadable "error" (handled
    // below), but Next.js documents request.signal as the authoritative
    // client-disconnect signal, so we act on it directly rather than relying
    // only on stream-error propagation.
    function onAbort(): void {
      fail(new ApiError(400, "client_aborted", "The upload request was aborted by the client."));
    }
    request.signal.addEventListener("abort", onAbort, { once: true });

    busboy.on("field", (fieldname: string, value: string) => {
      if (fieldname !== "language") {
        fail(new ApiError(400, "unexpected_field", `Unexpected form field: ${fieldname}`));
        return;
      }
      if (sawLanguage) {
        fail(new ApiError(400, "duplicate_field", 'Only one "language" field is accepted.'));
        return;
      }
      sawLanguage = true;
      language = value;
    });

    busboy.on("file", (fieldname: string, fileStream: BusboyFileStream, filename: string) => {
      if (fieldname !== "file" || sawFile) {
        fileStream.resume();
        fail(
          new ApiError(
            400,
            fieldname !== "file" ? "unexpected_file_field" : "too_many_files",
            fieldname !== "file"
              ? `Unexpected file field: ${fieldname}`
              : "Only one file part is accepted.",
          ),
        );
        return;
      }
      if (!filename) {
        fileStream.resume();
        fail(new ApiError(400, "missing_filename", "Uploaded file has no filename."));
        return;
      }

      sawFile = true;
      originalFilename = filename;
      tempFileCreated = true;
      writeStream = createWriteStream(tempFilePath);

      fileStream.on("data", (chunk: Buffer) => {
        sniffer.push(chunk);
        fileBytesWritten += chunk.length;
      });

      fileStream.on("limit", () => {
        fail(
          new ApiError(
            413,
            "file_too_large",
            `Upload exceeds the ${MAX_UPLOAD_BYTES}-byte limit.`,
          ),
        );
      });

      fileStream.on("error", (err: Error) => {
        fail(new ApiError(400, "upload_stream_error", err.message));
      });

      writeStream.on("error", (err: Error) => {
        // Unlike the client-body-stream errors above, this is a server-side
        // filesystem error on a path we chose (DATA_DIR-derived) -- Node fs
        // error messages embed the actual absolute path (e.g. "ENOENT: ...
        // open '/real/DATA_DIR/uploads/...'"), which must never reach the
        // API client. Log the real error server-side; return a static one.
        // eslint-disable-next-line no-console
        console.error("Temp file write error during upload:", err);
        fail(new ApiError(500, "temp_file_write_error", "Failed to write the uploaded file."));
      });

      fileStream.pipe(writeStream);
    });

    busboy.on("filesLimit", () => {
      fail(new ApiError(400, "too_many_files", "Only one file part is accepted."));
    });

    busboy.on("fieldsLimit", () => {
      fail(new ApiError(400, "too_many_fields", "Too many form fields in the upload request."));
    });

    busboy.on("partsLimit", () => {
      fail(new ApiError(400, "too_many_parts", "Too many parts in the upload request."));
    });

    busboy.on("error", (err: unknown) => {
      fail(new ApiError(400, "malformed_multipart", err instanceof Error ? err.message : String(err)));
    });

    busboy.on("finish", () => {
      if (settled) return;
      if (!sawFile) {
        fail(new ApiError(400, "missing_file", 'A file part named "file" is required.'));
        return;
      }
      if (writeStream && !writeStream.writableFinished) {
        writeStream.once("close", succeed);
        return;
      }
      succeed();
    });

    nodeReadable.on("error", (err: Error) => {
      fail(new ApiError(400, "upload_stream_error", err.message));
    });

    nodeReadable.pipe(busboy);
  });
}
