/**
 * Strict JSON Content-Type enforcement and a deliberately small request-body
 * size ceiling for credential-mutation requests, enforced at the reading
 * boundary -- the stream is stopped once the limit is exceeded, not just
 * checked after the full body is already buffered. No new body-parsing
 * dependency: a Configure/Replace payload is a single short string, so a
 * small hand-rolled bounded reader is enough (unlike the upload pipeline's
 * much larger, streaming-file requirements). `Content-Length`, when present,
 * is only an early-rejection optimization -- the actual byte-counted read
 * loop below is what enforces the limit regardless of whether the header is
 * present or accurate.
 */

import { ApiError } from "@/lib/http";

// Comfortable JSON-envelope overhead over any plausible API key length --
// not sized to an assumed maximum key length.
export const MAX_PROVIDER_MUTATION_BODY_BYTES = 8 * 1024;

export async function readBoundedJsonBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new ApiError(
      415,
      "unsupported_content_type",
      "Content-Type must be application/json.",
    );
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength) {
    const parsed = Number(declaredLength);
    if (Number.isFinite(parsed) && parsed > MAX_PROVIDER_MUTATION_BODY_BYTES) {
      throw new ApiError(413, "payload_too_large", "Request body is too large.");
    }
  }

  if (!request.body) {
    throw new ApiError(400, "empty_body", "Request body is required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_PROVIDER_MUTATION_BODY_BYTES) {
          throw new ApiError(413, "payload_too_large", "Request body is too large.");
        }
        chunks.push(value);
      }
    }
  } finally {
    await reader.cancel().catch(() => {
      /* best-effort: stop pulling more bytes once we're done with the stream either way */
    });
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder("utf-8").decode(combined);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ApiError(400, "malformed_json", "Request body is not valid JSON.");
  }
  return parsed;
}
