/**
 * The single, canonical env > managed > unconfigured resolver (Owner
 * Decisions 2 and 3). Shared by packages/web (status/Configure/Replace/
 * Remove) and packages/runner (fresh resolution immediately before every
 * job) so the two consumers can never disagree about which source is
 * active. An environment value is always authoritative and is never
 * overridden by a freshly-read managed value; the environment source itself
 * is never re-read for changes within a running process (Owner Decision 3
 * §3) -- only the managed tier is re-read fresh on every call.
 */

import { readManagedConfig } from "./store.js";

/**
 * Blockers B2/B4: this is the browser-facing status contract and it is
 * locked to exactly these three values. A managed-configuration failure is
 * never a fourth `source` -- see `SafeProviderStatus.configError` below,
 * which is a sibling signal, not a new source.
 */
export type ConfigSource = "environment" | "managed" | "unconfigured";

export type ResolvedOpenAIConfig =
  | { kind: "configured"; source: "environment"; locked: true; apiKey: string }
  | { kind: "configured"; source: "managed"; locked: false; apiKey: string }
  | { kind: "unconfigured" }
  | {
      kind: "managed_error";
      reason: "corrupt" | "unsupported_schema_version" | "read_error";
      message: string;
    };

/**
 * Never contains a raw credential -- the only shape ever safe to return to a
 * browser. `source` is exactly "environment" | "managed" | "unconfigured"
 * (blockers B2/B4); a managed-configuration read failure is represented by
 * `configError: true` alongside `source: "unconfigured"`, never by a fourth
 * `source` value and never by exposing the internal reason/message (path,
 * raw fs error, schema/file contents). The browser only ever needs to know
 * that operator attention is required, not why.
 */
export interface SafeProviderStatus {
  configured: boolean;
  source: ConfigSource;
  locked: boolean;
  configError?: true;
}

export async function resolveOpenAIConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedOpenAIConfig> {
  const envKey = env.OPENAI_API_KEY;
  if (envKey && envKey.trim() !== "") {
    return { kind: "configured", source: "environment", locked: true, apiKey: envKey };
  }

  const managed = await readManagedConfig(env);
  switch (managed.kind) {
    case "ok":
      return { kind: "configured", source: "managed", locked: false, apiKey: managed.openaiApiKey };
    case "missing":
      return { kind: "unconfigured" };
    case "corrupt":
      return { kind: "managed_error", reason: "corrupt", message: managed.reason };
    case "unsupported_schema_version":
      return {
        kind: "managed_error",
        reason: "unsupported_schema_version",
        message: `unsupported managed configuration schema_version: ${JSON.stringify(managed.version)}`,
      };
    case "read_error":
      return { kind: "managed_error", reason: "read_error", message: managed.reason };
  }
}

/** Strips the resolved config down to the shape that's ever safe to expose to a browser. */
export function toSafeProviderStatus(resolved: ResolvedOpenAIConfig): SafeProviderStatus {
  switch (resolved.kind) {
    case "configured":
      return { configured: true, source: resolved.source, locked: resolved.locked };
    case "unconfigured":
      return { configured: false, source: "unconfigured", locked: false };
    case "managed_error":
      // Collapses to "unconfigured" plus the safe configError sibling
      // (blockers B2/B4) -- never a fourth `source` value, and never the
      // internal reason/message (which may be more diagnostic than a
      // browser should see, even though it isn't a raw credential).
      return { configured: false, source: "unconfigured", locked: false, configError: true };
  }
}
