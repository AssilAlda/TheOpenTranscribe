import { afterEach, describe, expect, it, vi } from "vitest";

import { validateOpenAIKey } from "@/lib/provider/validateOpenAIKey";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetchOnce(response: Partial<Response> & { ok: boolean; status: number }): void {
  global.fetch = vi.fn().mockResolvedValue(response as Response);
}

describe("validateOpenAIKey", () => {
  it("classifies a 200 OK response as validated", async () => {
    mockFetchOnce({ ok: true, status: 200 });
    const result = await validateOpenAIKey("sk-valid");
    expect(result.outcome).toBe("validated");
  });

  it("classifies a 401 with error.code = invalid_api_key as unverified -- no stable documented contract for that code", async () => {
    // OpenAI's official error-codes documentation does not assign a stable
    // `error.code` to any of its documented 401 cases, and a VALID key can
    // receive 401 ip_not_authorized -- so even this specific code is not
    // authoritative evidence the credential itself is invalid.
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "invalid_api_key", message: "Incorrect API key provided" } }),
    } as unknown as Response);

    const result = await validateOpenAIKey("sk-bad");
    expect(result.outcome).toBe("unverified");
  });

  it("classifies a 401 with error.code = ip_not_authorized as unverified, not invalid -- a valid key can receive this", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "ip_not_authorized", message: "Your IP is not authorized" } }),
    } as unknown as Response);

    const result = await validateOpenAIKey("sk-valid-but-ip-blocked");
    expect(result.outcome).toBe("unverified");
  });

  it("classifies a 401 WITHOUT any structured code as unverified", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { code: "some_other_code" } }),
    } as unknown as Response);

    const result = await validateOpenAIKey("sk-ambiguous");
    expect(result.outcome).toBe("unverified");
  });

  it("classifies a 401 with an unparseable body as unverified", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);

    const result = await validateOpenAIKey("sk-ambiguous");
    expect(result.outcome).toBe("unverified");
  });

  it("never reads the 401 response body at all -- classification no longer depends on parsing it", async () => {
    const jsonSpy = vi.fn().mockRejectedValue(new Error("should not be called"));
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401, json: jsonSpy } as unknown as Response);

    const result = await validateOpenAIKey("sk-ambiguous");
    expect(result.outcome).toBe("unverified");
    expect(jsonSpy).not.toHaveBeenCalled();
  });

  it("no response, from any status code, is ever classified invalid", async () => {
    for (const status of [400, 401, 403, 404, 429, 500, 503]) {
      global.fetch = vi.fn().mockResolvedValue({ ok: false, status } as unknown as Response);
      const result = await validateOpenAIKey("sk-any");
      expect(result.outcome).not.toBe("invalid");
    }
  });

  it("classifies a 403 (permission-scoped key) as unverified, not invalid", async () => {
    mockFetchOnce({ ok: false, status: 403 });
    const result = await validateOpenAIKey("sk-scoped");
    expect(result.outcome).toBe("unverified");
  });

  it("classifies a 429 (rate limit) as unverified, not invalid", async () => {
    mockFetchOnce({ ok: false, status: 429 });
    const result = await validateOpenAIKey("sk-ratelimited");
    expect(result.outcome).toBe("unverified");
  });

  it("classifies a 5xx (provider outage) as unverified, not invalid", async () => {
    mockFetchOnce({ ok: false, status: 503 });
    const result = await validateOpenAIKey("sk-outage");
    expect(result.outcome).toBe("unverified");
  });

  it("classifies a network/DNS failure as unverified", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));
    const result = await validateOpenAIKey("sk-network-fail");
    expect(result.outcome).toBe("unverified");
    expect(result.detail).toBe("network_error");
  });

  it("classifies a timeout as unverified", async () => {
    global.fetch = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.useFakeTimers();
    const promise = validateOpenAIKey("sk-slow");
    await vi.advanceTimersByTimeAsync(9000);
    const result = await promise;
    expect(result.outcome).toBe("unverified");
    expect(result.detail).toBe("timeout");
    vi.useRealTimers();
  });

  it("uses the documented /v1/me account-information endpoint, never a transcription/audio endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock;
    await validateOpenAIKey("sk-any");
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).not.toContain("audio");
    expect(calledUrl).not.toContain("transcriptions");
    expect(calledUrl).toBe("https://api.openai.com/v1/me");
  });

  it("never persists, logs, or returns the /v1/me identity/org response body", async () => {
    const identityBody = { object: "user", id: "user-abc123", email: "someone@example.com", name: "Someone" };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => identityBody,
    } as unknown as Response);

    const result = await validateOpenAIKey("sk-any");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("user-abc123");
    expect(serialized).not.toContain("someone@example.com");
    expect(result).toEqual({ outcome: "validated", detail: "account_lookup_succeeded" });
  });

  it("sends the candidate key only via the Authorization header, never as a query param", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    global.fetch = fetchMock;
    await validateOpenAIKey("sk-secret-value");
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).not.toContain("sk-secret-value");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-secret-value");
  });
});
