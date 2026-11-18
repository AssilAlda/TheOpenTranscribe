import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DELETE, GET, POST } from "../../app/api/provider/openai/route";

const originalFetch = global.fetch;
const originalEnv: Record<string, string | undefined> = {};

function saveAndSet(key: string, value: string | undefined): void {
  originalEnv[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

let configDir: string;

beforeEach(() => {
  configDir = mkdtempSync(join(tmpdir(), "totr-web-route-provider-"));
  saveAndSet("THEOPENTRANSCRIBE_CONFIG_DIR", configDir);
  saveAndSet("OPENAI_API_KEY", undefined);
});

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function postRequest(body: unknown, origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/provider/openai", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

function deleteRequest(origin = "http://localhost:3000"): Request {
  return new Request("http://localhost:3000/api/provider/openai", {
    method: "DELETE",
    headers: { origin },
  });
}

function mockValidatedFetch(): void {
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
}

/**
 * OpenAI validation refinement: current official OpenAI documentation does
 * not substantiate a stable structured "invalid API key" signal (see
 * validateOpenAIKey.ts), so a 401 -- even one carrying the previously-used
 * `invalid_api_key` code -- now classifies as UNVERIFIED, not INVALID, and
 * is persisted rather than rejected (fail-open).
 */
function mockSuspicious401Fetch(): void {
  global.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 401,
    json: async () => ({ error: { code: "invalid_api_key" } }),
  } as unknown as Response);
}

function mockAmbiguousFetch(): void {
  global.fetch = vi.fn().mockRejectedValue(new Error("network down"));
}

function writeRawConfig(contents: string): string {
  const path = join(configDir, "provider-config.json");
  writeFileSync(path, contents);
  return path;
}

describe("GET /api/provider/openai", () => {
  it("reports unconfigured when nothing is set", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.data).toEqual({ configured: false, source: "unconfigured", locked: false });
  });

  // Blockers B2/B4: safe status `source` is locked to exactly three values;
  // a managed-configuration failure is a sibling `configError` flag on
  // `source: "unconfigured"`, never a fourth `source` value.

  it("malformed JSON never emits a fourth source value, and sets the safe configError signal", async () => {
    writeRawConfig("{not valid json");
    const res = await GET();
    const body = await res.json();
    expect(body.data.source).toBe("unconfigured");
    expect(body.data.configError).toBe(true);
  });

  it("an unsupported/future schema_version never emits a fourth source value, and sets the safe configError signal", async () => {
    writeRawConfig(JSON.stringify({ schema_version: 99, openai_api_key: "sk-future" }));
    const res = await GET();
    const body = await res.json();
    expect(body.data.source).toBe("unconfigured");
    expect(body.data.configError).toBe(true);
  });

  it("an unreadable managed config directory never emits a fourth source value, and sets the safe configError signal", async () => {
    // A directory in place of the config file is a filesystem-level read
    // error distinct from malformed JSON or an unsupported schema.
    const path = join(configDir, "provider-config.json");
    mkdirSync(path);
    const res = await GET();
    const body = await res.json();
    expect(["environment", "managed", "unconfigured"]).toContain(body.data.source);
    expect(body.data.source).toBe("unconfigured");
    expect(body.data.configError).toBe(true);
  });

  it("the safe DTO never leaks a filesystem path, raw fs error, credential, or config file contents", async () => {
    writeRawConfig(JSON.stringify({ schema_version: 99, openai_api_key: "sk-should-not-leak-either" }));
    const res = await GET();
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain(configDir);
    expect(serialized).not.toContain("sk-should-not-leak-either");
    expect(serialized).not.toContain("schema_version");
    expect(serialized).not.toContain("99");
    expect(Object.keys(body.data).sort()).toEqual(["configError", "configured", "locked", "source"]);
  });

  it("never returns a raw credential", async () => {
    mockValidatedFetch();
    await POST(postRequest({ openai_api_key: "sk-should-not-leak" }));

    const res = await GET();
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("sk-should-not-leak");
  });

  it("includes Cache-Control: no-store and X-Content-Type-Options: nosniff", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("reports environment-locked state when OPENAI_API_KEY is set", async () => {
    saveAndSet("OPENAI_API_KEY", "sk-env-value");
    const res = await GET();
    const body = await res.json();
    expect(body.data).toEqual({ configured: true, source: "environment", locked: true });
  });
});

describe("POST /api/provider/openai (Configure/Replace)", () => {
  it("rejects a request from an untrusted Origin", async () => {
    mockValidatedFetch();
    const res = await POST(postRequest({ openai_api_key: "sk-test" }, "http://evil.example"));
    expect(res.status).toBe(403);
  });

  it("persists a VALIDATED candidate and reports it in the response", async () => {
    mockValidatedFetch();
    const res = await POST(postRequest({ openai_api_key: "sk-valid-key" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.configured).toBe(true);
    expect(body.data.source).toBe("managed");
    expect(body.data.validation).toBe("validated");
  });

  it("persists an UNVERIFIED candidate (ambiguous provider/network failure) rather than rejecting it", async () => {
    mockAmbiguousFetch();
    const res = await POST(postRequest({ openai_api_key: "sk-unverified-key" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.configured).toBe(true);
    expect(body.data.validation).toBe("unverified");
  });

  it("persists a candidate that gets a 401 with the previously-used invalid_api_key code, as UNVERIFIED (fail-open)", async () => {
    mockSuspicious401Fetch();
    const res = await POST(postRequest({ openai_api_key: "sk-suspicious-key" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.configured).toBe(true);
    expect(body.data.validation).toBe("unverified");
  });

  describe("route-level INVALID rejection path (preserved even though nothing currently triggers it)", () => {
    afterEach(() => {
      vi.doUnmock("@/lib/provider/validateOpenAIKey");
      vi.resetModules();
    });

    it("rejects (422) and never persists a candidate the validator classifies INVALID", async () => {
      vi.doMock("@/lib/provider/validateOpenAIKey", () => ({
        validateOpenAIKey: vi.fn().mockResolvedValue({ outcome: "invalid", detail: "test_forced_invalid" }),
      }));
      vi.resetModules();
      const { POST: isolatedPost, GET: isolatedGet } = await import("../../app/api/provider/openai/route");

      const res = await isolatedPost(postRequest({ openai_api_key: "sk-forced-invalid" }));
      expect(res.status).toBe(422);

      const status = await (await isolatedGet()).json();
      expect(status.data.configured).toBe(false);
    });

    it("replacing an existing managed key with an INVALID candidate preserves the previous key's configured state", async () => {
      const validateMock = vi
        .fn()
        .mockResolvedValueOnce({ outcome: "validated", detail: "x" })
        .mockResolvedValue({ outcome: "invalid", detail: "test_forced_invalid" });
      vi.doMock("@/lib/provider/validateOpenAIKey", () => ({ validateOpenAIKey: validateMock }));
      vi.resetModules();
      const { POST: isolatedPost, GET: isolatedGet } = await import("../../app/api/provider/openai/route");

      await isolatedPost(postRequest({ openai_api_key: "sk-original" }));
      const replaceRes = await isolatedPost(postRequest({ openai_api_key: "sk-replacement" }));
      expect(replaceRes.status).toBe(422);

      const status = await (await isolatedGet()).json();
      expect(status.data.configured).toBe(true);
      expect(status.data.source).toBe("managed");
    });
  });

  it("rejects a mutation attempt when the environment owns the credential", async () => {
    saveAndSet("OPENAI_API_KEY", "sk-env-value");
    mockValidatedFetch();
    const res = await POST(postRequest({ openai_api_key: "sk-new-value" }));
    expect(res.status).toBe(409);
  });

  it("never echoes the submitted candidate back in the response", async () => {
    mockValidatedFetch();
    const res = await POST(postRequest({ openai_api_key: "sk-should-never-be-echoed" }));
    const body = await res.json();
    expect(JSON.stringify(body)).not.toContain("sk-should-never-be-echoed");
  });

  it("rejects a missing/empty openai_api_key", async () => {
    const res = await POST(postRequest({ openai_api_key: "" }));
    expect(res.status).toBe(400);
  });

  it("rejects a non-JSON Content-Type", async () => {
    const req = new Request("http://localhost:3000/api/provider/openai", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "http://localhost:3000" },
      body: "openai_api_key=sk-test",
    });
    const res = await POST(req);
    expect(res.status).toBe(415);
  });

  it("includes Cache-Control: no-store on the mutation response", async () => {
    mockValidatedFetch();
    const res = await POST(postRequest({ openai_api_key: "sk-test" }));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  // An unsupported/future schema_version must never be overwritten by
  // Configure/Replace.

  it("rejects Configure/Replace against an unsupported/future schema_version, leaving the file byte-for-byte identical", async () => {
    mockValidatedFetch();
    const path = writeRawConfig(JSON.stringify({ schema_version: 99, openai_api_key: "sk-future-untouched" }));
    const before = readFileSync(path, "utf-8");

    const res = await POST(postRequest({ openai_api_key: "sk-should-never-persist" }));
    expect(res.status).toBe(409);

    expect(readFileSync(path, "utf-8")).toBe(before);
  });
});

describe("DELETE /api/provider/openai (Remove)", () => {
  it("rejects a request from an untrusted Origin", async () => {
    const res = await DELETE(deleteRequest("http://evil.example"));
    expect(res.status).toBe(403);
  });

  it("removes an existing managed key", async () => {
    mockValidatedFetch();
    await POST(postRequest({ openai_api_key: "sk-to-remove" }));

    const res = await DELETE(deleteRequest());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ configured: false, source: "unconfigured", locked: false });
  });

  it("is a safe no-op when nothing is configured yet", async () => {
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(200);
  });

  it("rejects a removal attempt when the environment owns the credential", async () => {
    saveAndSet("OPENAI_API_KEY", "sk-env-value");
    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(409);
  });

  // DELETE is still a destructive mutation -- an unsupported/future
  // schema_version must never be removed either.

  it("rejects Remove against an unsupported/future schema_version, leaving the file byte-for-byte identical", async () => {
    const path = writeRawConfig(JSON.stringify({ schema_version: 99, openai_api_key: "sk-future-untouched" }));
    const before = readFileSync(path, "utf-8");

    const res = await DELETE(deleteRequest());
    expect(res.status).toBe(409);

    expect(readFileSync(path, "utf-8")).toBe(before);
  });
});
