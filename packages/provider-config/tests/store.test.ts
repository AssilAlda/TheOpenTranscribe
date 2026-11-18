import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, rename: vi.fn(actual.rename) };
});

import { rename } from "node:fs/promises";

import { ProviderConfigError } from "../src/errors.js";
import {
  readManagedConfig,
  removeManagedConfig,
  resolveManagedConfigPath,
  writeManagedConfig,
} from "../src/store.js";

const tempDirs: string[] = [];
function makeTempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "totr-provider-config-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  tempDirs.length = 0;
});

describe("readManagedConfig", () => {
  it("reports missing when no file exists", async () => {
    const dir = makeTempConfigDir();
    const result = await readManagedConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: join(dir, "nested") });
    expect(result).toEqual({ kind: "missing" });
  });

  it("parses a valid schema_version 1 document", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-test-key-value", env);
    const result = await readManagedConfig(env);
    expect(result).toEqual({ kind: "ok", openaiApiKey: "sk-test-key-value" });
  });

  it("reports corrupt on malformed JSON", async () => {
    const dir = makeTempConfigDir();
    writeFileSync(join(dir, "provider-config.json"), "{not valid json");
    const result = await readManagedConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir });
    expect(result.kind).toBe("corrupt");
  });

  it("reports unsupported_schema_version for a future schema and does not guess", async () => {
    const dir = makeTempConfigDir();
    writeFileSync(
      join(dir, "provider-config.json"),
      JSON.stringify({ schema_version: 99, openai_api_key: "sk-future" }),
    );
    const result = await readManagedConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir });
    expect(result).toEqual({ kind: "unsupported_schema_version", version: 99 });
  });

  it("reports corrupt when the required key field is missing", async () => {
    const dir = makeTempConfigDir();
    writeFileSync(join(dir, "provider-config.json"), JSON.stringify({ schema_version: 1 }));
    const result = await readManagedConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir });
    expect(result.kind).toBe("corrupt");
  });

  it("reports corrupt when the key field has the wrong type", async () => {
    const dir = makeTempConfigDir();
    writeFileSync(
      join(dir, "provider-config.json"),
      JSON.stringify({ schema_version: 1, openai_api_key: 12345 }),
    );
    const result = await readManagedConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir });
    expect(result.kind).toBe("corrupt");
  });

  it("never includes the raw credential in an error/parse result", async () => {
    const dir = makeTempConfigDir();
    writeFileSync(join(dir, "provider-config.json"), "totally-not-json-sk-should-not-appear-anywhere");
    const result = await readManagedConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir });
    expect(JSON.stringify(result)).not.toContain("sk-should-not-appear-anywhere");
  });
});

describe("writeManagedConfig", () => {
  it("writes atomically -- readers never observe a partial file, and the final file round-trips", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-atomic-write-test", env);

    const path = resolveManagedConfigPath(env);
    expect(existsSync(path)).toBe(true);
    const contents = JSON.parse(readFileSync(path, "utf-8"));
    expect(contents).toEqual({ schema_version: 1, openai_api_key: "sk-atomic-write-test" });

    // No leftover temp file after a successful write.
    const files = readdirSync(dir);
    expect(files.filter((f) => f.startsWith(".tmp-"))).toHaveLength(0);
  });

  it("replacing an existing key overwrites it atomically", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-first", env);
    await writeManagedConfig("sk-second", env);

    const result = await readManagedConfig(env);
    expect(result).toEqual({ kind: "ok", openaiApiKey: "sk-second" });
  });

  it("creates the config directory if it doesn't exist yet", async () => {
    const dir = makeTempConfigDir();
    const nested = join(dir, "nested", "config-root");
    await writeManagedConfig("sk-creates-dir", { THEOPENTRANSCRIBE_CONFIG_DIR: nested });
    expect(existsSync(join(nested, "provider-config.json"))).toBe(true);
  });

  it("applies restrictive permissions on POSIX platforms", async () => {
    if (process.platform === "win32") return;
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-permissions-test", env);
    const path = resolveManagedConfigPath(env);
    const { statSync } = await import("node:fs");
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  // An unknown/future schema_version must never be overwritten.

  it("refuses to overwrite an existing unsupported/future schema_version, leaving the file byte-for-byte identical", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    const path = resolveManagedConfigPath(env);
    const futureDoc = JSON.stringify({ schema_version: 99, openai_api_key: "sk-future-untouched" });
    writeFileSync(path, futureDoc);

    await expect(writeManagedConfig("sk-should-never-persist", env)).rejects.toThrow(ProviderConfigError);

    expect(readFileSync(path, "utf-8")).toBe(futureDoc);
  });

  it("the rejection is a typed, secret-free ProviderConfigError", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    const path = resolveManagedConfigPath(env);
    writeFileSync(path, JSON.stringify({ schema_version: 99, openai_api_key: "sk-future" }));

    try {
      await writeManagedConfig("sk-should-not-leak", env);
      expect.unreachable("writeManagedConfig should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ProviderConfigError);
      expect((err as ProviderConfigError).code).toBe("unsupported_managed_schema");
      const serialized = JSON.stringify({ message: (err as Error).message, code: (err as ProviderConfigError).code });
      expect(serialized).not.toContain("sk-should-not-leak");
      expect(serialized).not.toContain(path);
    }
  });

  describe("atomic replacement failure", () => {
    afterEach(() => {
      vi.mocked(rename).mockClear();
    });

    it("leaves the previous file byte-for-byte intact and cleans up the temp file when the atomic rename fails", async () => {
      const dir = makeTempConfigDir();
      const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
      await writeManagedConfig("sk-original-value", env);

      const path = resolveManagedConfigPath(env);
      const before = readFileSync(path);

      vi.mocked(rename).mockRejectedValueOnce(new Error("simulated rename failure"));

      let thrown: unknown;
      try {
        await writeManagedConfig("sk-should-never-persist-either", env);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).not.toContain("sk-should-never-persist-either");

      expect(readFileSync(path)).toEqual(before);
      const leftoverTempFiles = readdirSync(dir).filter((f) => f.startsWith(".tmp-"));
      expect(leftoverTempFiles).toHaveLength(0);
    });
  });
});

describe("removeManagedConfig", () => {
  it("deletes an existing managed config file", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-to-remove", env);
    await removeManagedConfig(env);
    const result = await readManagedConfig(env);
    expect(result).toEqual({ kind: "missing" });
  });

  it("is a safe no-op when nothing exists yet", async () => {
    const dir = makeTempConfigDir();
    await expect(removeManagedConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir })).resolves.toBeUndefined();
  });

  // DELETE is still a destructive mutation -- an unknown/future
  // schema_version must never be removed either.

  it("refuses to remove an existing unsupported/future schema_version, leaving the file byte-for-byte identical", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    const path = resolveManagedConfigPath(env);
    const futureDoc = JSON.stringify({ schema_version: 99, openai_api_key: "sk-future-untouched" });
    writeFileSync(path, futureDoc);

    await expect(removeManagedConfig(env)).rejects.toThrow(ProviderConfigError);

    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe(futureDoc);
  });
});
