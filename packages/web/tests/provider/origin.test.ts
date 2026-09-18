import { describe, expect, it } from "vitest";

import { isRequestOriginTrusted, isTrustedOrigin } from "@/lib/provider/origin";

function makeRequest(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("origin", origin);
  return new Request("http://example.invalid/api/provider/openai", { method: "POST", headers });
}

describe("isTrustedOrigin", () => {
  it("trusts http://localhost at any port", () => {
    expect(isTrustedOrigin("http://localhost:3000")).toBe(true);
    expect(isTrustedOrigin("http://localhost:8080")).toBe(true);
  });

  it("trusts 127.0.0.1 and [::1]", () => {
    expect(isTrustedOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isTrustedOrigin("http://[::1]:3000")).toBe(true);
  });

  it("does not trust an arbitrary external origin by default", () => {
    expect(isTrustedOrigin("http://evil.example")).toBe(false);
  });

  it("does not trust an origin merely because a caller-supplied Host header would match it (no Host is ever consulted)", () => {
    // This function never even looks at Host -- verified structurally by
    // its signature (origin string only) -- this test documents the intent.
    expect(isTrustedOrigin("http://attacker-controlled-host.example")).toBe(false);
  });

  it("trusts an origin explicitly listed in THEOPENTRANSCRIBE_TRUSTED_ORIGINS", () => {
    const env = {
      ...process.env,
      THEOPENTRANSCRIBE_TRUSTED_ORIGINS: "http://192.168.1.50:3000,http://transcribe.lan:3000",
    };
    expect(isTrustedOrigin("http://192.168.1.50:3000", env)).toBe(true);
    expect(isTrustedOrigin("http://transcribe.lan:3000", env)).toBe(true);
  });

  it("does not trust an origin not on the explicit trusted-LAN list", () => {
    const env = { ...process.env, THEOPENTRANSCRIBE_TRUSTED_ORIGINS: "http://192.168.1.50:3000" };
    expect(isTrustedOrigin("http://192.168.1.51:3000", env)).toBe(false);
  });

  it("handles a malformed origin value safely (never throws)", () => {
    expect(() => isTrustedOrigin("not-a-valid-origin")).not.toThrow();
    expect(isTrustedOrigin("not-a-valid-origin")).toBe(false);
  });
});

describe("isRequestOriginTrusted", () => {
  it("accepts a request with a trusted Origin header", () => {
    expect(isRequestOriginTrusted(makeRequest("http://localhost:3000"))).toBe(true);
  });

  it("rejects a request with an untrusted Origin header", () => {
    expect(isRequestOriginTrusted(makeRequest("http://evil.example"))).toBe(false);
  });

  it("rejects a request with no Origin header at all -- deterministic, not treated as trusted by default", () => {
    expect(isRequestOriginTrusted(makeRequest(null))).toBe(false);
  });

  // CORRECTION 1's core scenario: an attacker's own page has Origin and Host
  // agreeing with each other (both the attacker's own hostname) -- a naive
  // check comparing Origin against the request's own Host header would
  // incorrectly accept this. This module never reads Host at all, so it
  // cannot be fooled this way regardless of what Host claims.
  it("rejects even when a spoofed Host header would match the (still untrusted) Origin", () => {
    const headers = new Headers({
      origin: "http://attacker-controlled-host.example",
      host: "attacker-controlled-host.example",
    });
    const request = new Request("http://example.invalid/api/provider/openai", { method: "POST", headers });
    expect(isRequestOriginTrusted(request)).toBe(false);
  });

  it("does not consult X-Forwarded-Host/X-Forwarded-Proto/Forwarded at all", () => {
    const headers = new Headers({
      origin: "http://evil.example",
      "x-forwarded-host": "localhost:3000",
      "x-forwarded-proto": "http",
      forwarded: "host=localhost:3000",
    });
    const request = new Request("http://example.invalid/api/provider/openai", { method: "POST", headers });
    expect(isRequestOriginTrusted(request)).toBe(false);
  });
});
