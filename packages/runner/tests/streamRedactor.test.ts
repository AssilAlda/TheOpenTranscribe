import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@theopentranscribe/provider-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@theopentranscribe/provider-config")>();
  return { ...actual, redactSecretText: vi.fn(actual.redactSecretText) };
});

import { redactSecretText } from "@theopentranscribe/provider-config";

import { StreamRedactor } from "../src/streamRedactor.js";

afterEach(() => {
  vi.mocked(redactSecretText).mockClear();
});

/**
 * These feed exact chunk boundaries directly into the redactor
 * (bypassing OS/pipe timing entirely) so the chunk split point is
 * deterministic, not merely likely. spawnCapture.test.ts separately proves
 * the real wiring through an actual child process.
 */
describe("StreamRedactor -- cross-chunk secret safety", () => {
  it("CASE A: an Authorization: Bearer header split mid-token across two chunks is never reconstructed", () => {
    const redactor = new StreamRedactor();
    const out1 = redactor.push("Authorization: Bearer sk-secret-PA");
    const out2 = redactor.push("RT-123456\n");
    const combined = out1 + out2 + redactor.flush();

    expect(combined).not.toContain("sk-secret-PART-123456");
    expect(combined).not.toContain("PART-123456");
  });

  it("CASE B: a JSON api_key value split mid-token across two chunks is never reconstructed", () => {
    const redactor = new StreamRedactor();
    const out1 = redactor.push('{"api_key":"sk-secret-');
    const out2 = redactor.push('123456"}\n');
    const combined = out1 + out2 + redactor.flush();

    expect(combined).not.toContain("sk-secret-123456");
  });

  it("CASE C: the exact known credential split near its beginning is never reconstructed", () => {
    const secret = "sk-known-credential-exact-value-0001";
    const redactor = new StreamRedactor([secret]);
    const out1 = redactor.push("s");
    const out2 = redactor.push(`${secret.slice(1)}\n`);
    const combined = out1 + out2 + redactor.flush();

    expect(combined).not.toContain(secret);
  });

  it("CASE C: the exact known credential split in the middle is never reconstructed", () => {
    const secret = "sk-known-credential-exact-value-0002";
    const mid = Math.floor(secret.length / 2);
    const redactor = new StreamRedactor([secret]);
    const out1 = redactor.push(`prefix text ${secret.slice(0, mid)}`);
    const out2 = redactor.push(`${secret.slice(mid)} suffix text\n`);
    const combined = out1 + out2 + redactor.flush();

    expect(combined).not.toContain(secret);
  });

  it("CASE C: the exact known credential split at its final character boundary is never reconstructed", () => {
    const secret = "sk-known-credential-exact-value-0003";
    const redactor = new StreamRedactor([secret]);
    const out1 = redactor.push(secret.slice(0, -1));
    const out2 = redactor.push(`${secret.slice(-1)}\n`);
    const combined = out1 + out2 + redactor.flush();

    expect(combined).not.toContain(secret);
  });

  it("CASE D: ordinary non-secret text split across chunks remains readable and is not unnecessarily destroyed", () => {
    const redactor = new StreamRedactor();
    const out1 = redactor.push("ordinary failure: file not fo");
    const out2 = redactor.push("und at /tmp/example.wav\n");
    const combined = out1 + out2 + redactor.flush();

    expect(combined).toBe("ordinary failure: file not found at /tmp/example.wav\n");
  });

  it("CASE E: redaction failure still fails closed rather than emitting the raw chunk", () => {
    vi.mocked(redactSecretText).mockImplementationOnce(() => {
      throw new Error("simulated redaction failure");
    });

    const redactor = new StreamRedactor(["sk-should-not-leak"]);
    const out = redactor.push("Authorization: Bearer sk-should-not-leak\n") + redactor.flush();

    expect(out).not.toContain("sk-should-not-leak");
    expect(out).toContain("[stderr redaction error -- output suppressed]");
  });

  it("never emits buffered content before a line is complete", () => {
    const redactor = new StreamRedactor(["sk-still-buffering"]);
    const out = redactor.push("Authorization: Bearer sk-still-buffer");
    expect(out).toBe("");
  });

  it("flush() emits and redacts a final line that never received a trailing newline", () => {
    const secret = "sk-no-trailing-newline-secret";
    const redactor = new StreamRedactor([secret]);
    redactor.push(`Authorization: Bearer ${secret.slice(0, 5)}`);
    const out = redactor.push(secret.slice(5)) + redactor.flush();
    expect(out).not.toContain(secret);
  });

  it("bounds unbounded single-line buffering without ever splitting the known secret", () => {
    const secret = "sk-oversized-line-secret-value-xyz";
    const redactor = new StreamRedactor([secret]);
    // A pathological single line with no newline, far larger than the
    // internal line-buffer bound, forces the oversized-line fallback path.
    const filler = "x".repeat(200_000);
    const out = redactor.push(filler + secret) + redactor.flush();
    expect(out).not.toContain(secret);
  });
});

/**
 * The old forced-flush design carried a trailing window sized from
 * `knownSecretLength + 32` past the line-buffer bound. That is a heuristic,
 * not a proof -- a generic secret pattern has no assumable maximum length, so
 * any fixed carry window can be defeated by a long enough credential
 * positioned to straddle the exact cut point. These tests exercise the
 * replacement fail-closed design: once a line exceeds MAX_LINE_BUFFER_CHARS
 * (65536) before its terminating newline, the whole line is replaced by one
 * fixed placeholder and nothing from it -- no prefix, no suffix, no fragment
 * -- is ever emitted raw.
 */
describe("StreamRedactor -- fail-closed oversized-line suppression", () => {
  const MAX_LINE_BUFFER_CHARS = 65536;
  const PLACEHOLDER = "[stderr line too long -- suppressed]\n";

  it("TEST A: the exact known credential straddling the old forced-flush cut point never leaks", () => {
    const secret = "sk-known-credential-straddling-the-old-cut-0001";
    // Position the secret so its final character lands exactly at the old
    // MAX_LINE_BUFFER_CHARS boundary -- the vicinity of the old
    // implementation's `buffer.length - (knownMax + 32)` forced-flush cut --
    // then push the whole line past the bound with trailing text after it.
    const fillerLen = MAX_LINE_BUFFER_CHARS - secret.length;
    const filler = "x".repeat(fillerLen);
    const redactor = new StreamRedactor([secret]);
    const out = redactor.push(filler + secret + "more-trailing-text") + redactor.flush();

    expect(out).not.toContain(secret);
    expect(out).not.toContain("more-trailing-text");
    expect(out).not.toContain(filler.slice(0, 100));
    expect(out).toBe(PLACEHOLDER);
  });

  it("TEST B: a generic very long Authorization: Bearer token never leaks", () => {
    const longToken = "B".repeat(MAX_LINE_BUFFER_CHARS + 1000);
    const line = `Authorization: Bearer ${longToken}`;
    const redactor = new StreamRedactor();
    const out = redactor.push(line) + redactor.flush();

    expect(out).not.toContain(longToken);
    expect(out).not.toContain(longToken.slice(0, 100));
    expect(out).toBe(PLACEHOLDER);
  });

  it("TEST C: a generic very long structured secret (access_token=...) never leaks", () => {
    const longSecret = "z".repeat(MAX_LINE_BUFFER_CHARS + 500);
    const redactor1 = new StreamRedactor();
    const out1 = redactor1.push(`access_token=${longSecret}`) + redactor1.flush();
    expect(out1).not.toContain(longSecret);
    expect(out1).not.toContain(longSecret.slice(0, 100));
    expect(out1).toBe(PLACEHOLDER);

    const redactor2 = new StreamRedactor();
    const out2 = redactor2.push(`api_key=${longSecret}`) + redactor2.flush();
    expect(out2).not.toContain(longSecret);
    expect(out2).not.toContain(longSecret.slice(0, 100));
    expect(out2).toBe(PLACEHOLDER);
  });

  it("TEST D: repeated forced-flush-sized chunks for one oversized line emit the placeholder at most once", () => {
    const redactor = new StreamRedactor(["sk-should-never-appear-anywhere"]);
    const chunk = "y".repeat(10_000);
    let out = "";
    // 10 chunks of 10,000 chars = 100,000 chars, comfortably past the
    // 65,536 bound, with no newline anywhere in the stream yet.
    for (let i = 0; i < 10; i++) {
      out += redactor.push(chunk);
    }
    out += redactor.push("sk-should-never-appear-anywhere");
    out += redactor.flush();

    expect(out).not.toContain("sk-should-never-appear-anywhere");
    expect(out).not.toContain(chunk.slice(0, 100));
    // Exactly one placeholder for the entire oversized logical line.
    expect(out.split(PLACEHOLDER).length - 1).toBe(1);
    expect(out).toBe(PLACEHOLDER);
  });

  it("TEST E: a normal line immediately after an oversized line is preserved and redacted normally", () => {
    const redactor = new StreamRedactor();
    const filler = "x".repeat(MAX_LINE_BUFFER_CHARS + 100);
    const out =
      redactor.push(filler) + // no newline yet -- triggers suppression
      redactor.push("\nordinary diagnostic line\n") +
      redactor.flush();

    expect(out).not.toContain(filler.slice(0, 100));
    expect(out).toBe(`${PLACEHOLDER}ordinary diagnostic line\n`);
  });

  it("TEST F: an oversized line followed by a normal secret-bearing line redacts the second line normally", () => {
    const redactor = new StreamRedactor();
    const filler = "x".repeat(MAX_LINE_BUFFER_CHARS + 100);
    const out =
      redactor.push(`${filler}\nAuthorization: Bearer sk-normal-secret-afterwards\n`) +
      redactor.flush();

    expect(out).not.toContain(filler.slice(0, 100));
    expect(out).not.toContain("sk-normal-secret-afterwards");
    expect(out).toContain(PLACEHOLDER);
    expect(out).toContain("Authorization: [REDACTED]");
  });

  it("TEST G: EOF while still suppressing an oversized unterminated line emits no raw remainder", () => {
    const redactor = new StreamRedactor(["sk-eof-secret-should-not-leak"]);
    const filler = "x".repeat(MAX_LINE_BUFFER_CHARS + 100);
    const pushOut = redactor.push(filler + "sk-eof-secret-should-not-leak");
    const flushOut = redactor.flush();

    expect(pushOut).toBe(PLACEHOLDER);
    expect(flushOut).toBe("");
    expect(pushOut + flushOut).not.toContain("sk-eof-secret-should-not-leak");
    expect(pushOut + flushOut).not.toContain(filler.slice(0, 100));
  });

  it("multiple oversized lines interleaved with ordinary lines each resume normal behavior", () => {
    const redactor = new StreamRedactor();
    const filler1 = "a".repeat(MAX_LINE_BUFFER_CHARS + 50);
    const filler2 = "b".repeat(MAX_LINE_BUFFER_CHARS + 50);
    const input = `${filler1}\nordinary line one\n${filler2}\nordinary line two\n`;
    const out = redactor.push(input) + redactor.flush();

    expect(out).not.toContain(filler1.slice(0, 100));
    expect(out).not.toContain(filler2.slice(0, 100));
    expect(out).toBe(`${PLACEHOLDER}ordinary line one\n${PLACEHOLDER}ordinary line two\n`);
  });
});
