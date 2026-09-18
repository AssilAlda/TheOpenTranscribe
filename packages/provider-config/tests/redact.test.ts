import { describe, expect, it } from "vitest";

import { redactSecretText } from "../src/redact.js";

describe("redactSecretText", () => {
  it("redacts an Authorization: Bearer header", () => {
    const input = "request failed: Authorization: Bearer sk-abcdef1234567890 was rejected";
    const result = redactSecretText(input);
    expect(result).not.toContain("sk-abcdef1234567890");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts a bare Bearer token", () => {
    const input = "sent header value Bearer sk-abcdef1234567890abcdef to the API";
    const result = redactSecretText(input);
    expect(result).not.toContain("sk-abcdef1234567890abcdef");
  });

  it("redacts api_key=value style pairs", () => {
    const input = 'call failed with params {"api_key": "sk-verysecretvalue123"}';
    const result = redactSecretText(input);
    expect(result).not.toContain("sk-verysecretvalue123");
  });

  it("redacts JSON-like access_token pairs", () => {
    const input = '{"access_token": "abcdefghijklmnop1234567890"}';
    const result = redactSecretText(input);
    expect(result).not.toContain("abcdefghijklmnop1234567890");
  });

  it("redacts the exact currently-known secret even in unexpected surrounding text", () => {
    const secret = "sk-exact-value-not-matching-any-generic-pattern";
    const input = `unexpected diagnostic dump: value=${secret} end`;
    const result = redactSecretText(input, [secret]);
    expect(result).not.toContain(secret);
  });

  it("preserves an ordinary safe error message untouched", () => {
    const input = "Transcription failed: rate limit exceeded, please retry later.";
    expect(redactSecretText(input)).toBe(input);
  });

  it("handles future bearer-token-style text without requiring an OpenAI-specific prefix", () => {
    const input = "Authorization: Bearer ghp_1234567890abcdefFUTURE";
    const result = redactSecretText(input);
    expect(result).not.toContain("ghp_1234567890abcdefFUTURE");
  });

  it("does not throw on empty or unusual input", () => {
    expect(redactSecretText("")).toBe("");
    expect(() => redactSecretText("just plain text with no secrets")).not.toThrow();
  });
});
