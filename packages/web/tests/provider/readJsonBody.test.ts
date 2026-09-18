import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/http";
import { MAX_PROVIDER_MUTATION_BODY_BYTES, readBoundedJsonBody } from "@/lib/provider/readJsonBody";

function jsonRequest(body: string, contentType = "application/json"): Request {
  return new Request("http://example.invalid/api/provider/openai", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("readBoundedJsonBody", () => {
  it("parses a well-formed small JSON body", async () => {
    const result = await readBoundedJsonBody(jsonRequest(JSON.stringify({ openai_api_key: "sk-test" })));
    expect(result).toEqual({ openai_api_key: "sk-test" });
  });

  it("rejects a non-JSON Content-Type", async () => {
    const req = jsonRequest("openai_api_key=sk-test", "application/x-www-form-urlencoded");
    await expect(readBoundedJsonBody(req)).rejects.toBeInstanceOf(ApiError);
  });

  it("rejects multipart/form-data", async () => {
    const req = jsonRequest("irrelevant", "multipart/form-data; boundary=x");
    await expect(readBoundedJsonBody(req)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects text/plain", async () => {
    const req = jsonRequest("{}", "text/plain");
    await expect(readBoundedJsonBody(req)).rejects.toMatchObject({ status: 415 });
  });

  it("rejects malformed JSON", async () => {
    const req = jsonRequest("{not valid json");
    await expect(readBoundedJsonBody(req)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a body larger than the configured limit via an early Content-Length check", async () => {
    const oversized = "a".repeat(MAX_PROVIDER_MUTATION_BODY_BYTES + 1000);
    const req = jsonRequest(JSON.stringify({ openai_api_key: oversized }));
    await expect(readBoundedJsonBody(req)).rejects.toMatchObject({ status: 413 });
  });

  it("stops reading mid-stream once the byte ceiling is exceeded, even without a Content-Length header", async () => {
    const oversized = "a".repeat(MAX_PROVIDER_MUTATION_BODY_BYTES + 1000);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const payload = encoder.encode(JSON.stringify({ openai_api_key: oversized }));
        // Feed it in small chunks so the reader must actually accumulate
        // and check the running total, not just look at one big chunk.
        const chunkSize = 256;
        for (let i = 0; i < payload.length; i += chunkSize) {
          controller.enqueue(payload.slice(i, i + chunkSize));
        }
        controller.close();
      },
    });
    const req = new Request("http://example.invalid/api/provider/openai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // @ts-expect-error -- duplex is required by the runtime for a streaming body but not in the lib.dom Request init types here
      duplex: "half",
      body,
    });
    await expect(readBoundedJsonBody(req)).rejects.toMatchObject({ status: 413 });
  });

  it("rejects a request with no body", async () => {
    const req = new Request("http://example.invalid/api/provider/openai", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    await expect(readBoundedJsonBody(req)).rejects.toBeInstanceOf(ApiError);
  });
});
