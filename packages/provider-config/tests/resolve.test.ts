import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { resolveOpenAIConfig, toSafeProviderStatus } from "../src/resolve.js";
import { writeManagedConfig } from "../src/store.js";

const tempDirs: string[] = [];
function makeTempConfigDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "totr-provider-config-resolve-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  tempDirs.length = 0;
});

describe("resolveOpenAIConfig -- env > managed > unconfigured", () => {
  it("returns unconfigured when neither source exists", async () => {
    const dir = makeTempConfigDir();
    const result = await resolveOpenAIConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir });
    expect(result).toEqual({ kind: "unconfigured" });
  });

  it("uses the managed credential when env is absent", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-managed-value", env);
    const result = await resolveOpenAIConfig(env);
    expect(result).toEqual({ kind: "configured", source: "managed", locked: false, apiKey: "sk-managed-value" });
  });

  it("env wins even when managed is also present", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir, OPENAI_API_KEY: "sk-env-value" };
    await writeManagedConfig("sk-managed-value", env);
    const result = await resolveOpenAIConfig(env);
    expect(result).toEqual({ kind: "configured", source: "environment", locked: true, apiKey: "sk-env-value" });
  });

  it("env still wins after the managed value changes", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir, OPENAI_API_KEY: "sk-env-value" };
    await writeManagedConfig("sk-managed-a", env);
    expect(await resolveOpenAIConfig(env)).toEqual({
      kind: "configured",
      source: "environment",
      locked: true,
      apiKey: "sk-env-value",
    });
    await writeManagedConfig("sk-managed-b", env);
    expect(await resolveOpenAIConfig(env)).toEqual({
      kind: "configured",
      source: "environment",
      locked: true,
      apiKey: "sk-env-value",
    });
  });

  it("treats a blank/whitespace-only env value as absent, falling through to managed", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir, OPENAI_API_KEY: "   " };
    await writeManagedConfig("sk-managed-value", env);
    const result = await resolveOpenAIConfig(env);
    expect(result).toEqual({ kind: "configured", source: "managed", locked: false, apiKey: "sk-managed-value" });
  });

  it("surfaces managed corruption distinctly from unconfigured -- never silently collapsed", async () => {
    const dir = makeTempConfigDir();
    writeFileSync(join(dir, "provider-config.json"), "{not json");
    const result = await resolveOpenAIConfig({ THEOPENTRANSCRIBE_CONFIG_DIR: dir });
    expect(result.kind).toBe("managed_error");
    if (result.kind === "managed_error") {
      expect(result.reason).toBe("corrupt");
    }
  });

  it("a job that resolves before a later managed replacement keeps its own snapshot value (caller-level; this call itself is always fresh)", async () => {
    const dir = makeTempConfigDir();
    const env = { THEOPENTRANSCRIBE_CONFIG_DIR: dir };
    await writeManagedConfig("sk-first-snapshot", env);
    const first = await resolveOpenAIConfig(env);
    await writeManagedConfig("sk-second-snapshot", env);
    const second = await resolveOpenAIConfig(env);

    expect(first).toEqual({ kind: "configured", source: "managed", locked: false, apiKey: "sk-first-snapshot" });
    expect(second).toEqual({ kind: "configured", source: "managed", locked: false, apiKey: "sk-second-snapshot" });
  });
});

describe("toSafeProviderStatus", () => {
  it("never includes a raw credential for a configured (environment) result", () => {
    const status = toSafeProviderStatus({ kind: "configured", source: "environment", locked: true, apiKey: "sk-secret" });
    expect(status).toEqual({ configured: true, source: "environment", locked: true });
    expect(JSON.stringify(status)).not.toContain("sk-secret");
  });

  it("never includes a raw credential for a configured (managed) result", () => {
    const status = toSafeProviderStatus({ kind: "configured", source: "managed", locked: false, apiKey: "sk-secret" });
    expect(status).toEqual({ configured: true, source: "managed", locked: false });
    expect(JSON.stringify(status)).not.toContain("sk-secret");
  });

  it("reports unconfigured plainly", () => {
    expect(toSafeProviderStatus({ kind: "unconfigured" })).toEqual({
      configured: false,
      source: "unconfigured",
      locked: false,
    });
  });

  it("collapses managed_error to source: unconfigured + configError: true, never a fourth source value", () => {
    const status = toSafeProviderStatus({ kind: "managed_error", reason: "corrupt", message: "detail" });
    expect(status).toEqual({ configured: false, source: "unconfigured", locked: false, configError: true });
  });

  it("never leaks the internal managed_error reason/message in the safe DTO", () => {
    const status = toSafeProviderStatus({
      kind: "managed_error",
      reason: "unsupported_schema_version",
      message: "unsupported managed configuration schema_version: 99",
    });
    expect(JSON.stringify(status)).not.toContain("detail");
    expect(JSON.stringify(status)).not.toContain("schema_version");
    expect(JSON.stringify(status)).not.toContain("99");
  });

  it("source is only ever one of the three locked values, for every resolved kind", () => {
    const cases: Array<{ resolved: Parameters<typeof toSafeProviderStatus>[0] }> = [
      { resolved: { kind: "configured", source: "environment", locked: true, apiKey: "sk-x" } },
      { resolved: { kind: "configured", source: "managed", locked: false, apiKey: "sk-x" } },
      { resolved: { kind: "unconfigured" } },
      { resolved: { kind: "managed_error", reason: "corrupt", message: "m" } },
      { resolved: { kind: "managed_error", reason: "unsupported_schema_version", message: "m" } },
      { resolved: { kind: "managed_error", reason: "read_error", message: "m" } },
    ];
    for (const { resolved } of cases) {
      const status = toSafeProviderStatus(resolved);
      expect(["environment", "managed", "unconfigured"]).toContain(status.source);
    }
  });
});
