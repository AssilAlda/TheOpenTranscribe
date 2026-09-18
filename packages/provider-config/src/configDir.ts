/**
 * Phase 7 Owner Decision 8: the managed-configuration directory is resolved
 * from an explicit, optional, namespaced environment variable --
 * THEOPENTRANSCRIBE_CONFIG_DIR (never a generic CONFIG_DIR, to avoid
 * collisions and to stay self-explanatory in Docker/self-hosted setups) --
 * with a deterministic user-local fallback when it isn't set. Independent of
 * DATA_DIR (packages/db's resolveDataDir): never derived from it, never
 * placed inside it, and this package never reads DATA_DIR at all.
 *
 * This resolver is the one canonical implementation, consumed identically by
 * packages/web (Configure/Replace/Remove/status) and packages/runner
 * (per-job fresh resolution) -- neither reconstructs the path independently.
 */

import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

import { ProviderConfigError } from "./errors.js";

/**
 * Resolves the canonical application configuration-root directory.
 *
 * Precedence:
 *   1. THEOPENTRANSCRIBE_CONFIG_DIR, if explicitly set -- must be an
 *      absolute path; a relative value is a safe configuration error, never
 *      silently interpreted against CWD/repo-root/package-dir/DATA_DIR.
 *   2. A deterministic user-local fallback: $XDG_CONFIG_HOME/theopentranscribe
 *      when XDG_CONFIG_HOME is set (and itself absolute), otherwise
 *      ~/.theopentranscribe. This is the simplest cross-platform fallback
 *      consistent with the locked v1 scope (Owner Decision 8 §4 explicitly
 *      allows this single deterministic fallback over full platform-native
 *      resolution) -- the explicit env override remains the preferred,
 *      documented path for servers/containers.
 */
export function resolveConfigDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.THEOPENTRANSCRIBE_CONFIG_DIR;
  if (explicit !== undefined && explicit.trim() !== "") {
    if (!isAbsolute(explicit)) {
      throw new ProviderConfigError(
        "invalid_config_dir",
        "THEOPENTRANSCRIBE_CONFIG_DIR must be an absolute path.",
      );
    }
    return explicit;
  }

  const xdgConfigHome = env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim() !== "" && isAbsolute(xdgConfigHome)) {
    return join(xdgConfigHome, "theopentranscribe");
  }

  return join(homedir(), ".theopentranscribe");
}
