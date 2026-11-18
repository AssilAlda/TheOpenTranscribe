/**
 * Read/write/remove primitives for the managed `provider-config.json` file.
 * File-safety requirements: one canonical path, restrictive permissions
 * (0600 file / 0700 parent dir on POSIX where supported), same-directory
 * temp write, fsync, atomic rename, safe temp cleanup, explicit
 * malformed/corrupt-file handling. No interprocess lock: packages/web is the
 * sole writer, packages/runner is read-only, and atomic same-directory
 * replacement is the only correctness mechanism this v1 relies on -- which
 * in turn depends on that single-writer invariant holding.
 *
 * writeManagedConfig and removeManagedConfig both refuse to touch an existing
 * file whose schema_version this build doesn't recognize -- see
 * assertNoUnsupportedExistingSchema below. "We don't understand it" is never
 * treated as "safe to overwrite or delete it."
 */

import { randomBytes } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, rm, unlink } from "node:fs/promises";
import { join } from "node:path";

import { resolveConfigDir } from "./configDir.js";
import { ProviderConfigError } from "./errors.js";
import {
  MANAGED_CONFIG_FILENAME,
  SCHEMA_VERSION,
  isManagedProviderConfigV1,
  type ManagedProviderConfigV1,
} from "./schema.js";

export function resolveManagedConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveConfigDir(env), MANAGED_CONFIG_FILENAME);
}

/**
 * Distinguishes every required failure class: file missing (not an error --
 * the normal "no managed credential yet" state), a valid parse, malformed
 * JSON, an unsupported future schema_version (never guessed at or silently
 * overwritten), and a filesystem read error. None of these are ever collapsed
 * into a generic "unconfigured" by this layer -- that collapsing decision (if
 * any) belongs to the caller (see resolve.ts).
 */
export type ManagedConfigReadResult =
  | { kind: "missing" }
  | { kind: "ok"; openaiApiKey: string }
  | { kind: "corrupt"; reason: string }
  | { kind: "unsupported_schema_version"; version: unknown }
  | { kind: "read_error"; reason: string };

export async function readManagedConfig(
  env: NodeJS.ProcessEnv = process.env,
): Promise<ManagedConfigReadResult> {
  const path = resolveManagedConfigPath(env);

  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return { kind: "missing" };
    }
    return { kind: "read_error", reason: "unable to read the managed configuration file" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "corrupt", reason: "managed configuration file is not valid JSON" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { kind: "corrupt", reason: "managed configuration file does not contain a JSON object" };
  }

  const version = (parsed as { schema_version?: unknown }).schema_version;
  if (version === undefined) {
    return { kind: "corrupt", reason: "managed configuration file is missing schema_version" };
  }
  if (version !== SCHEMA_VERSION) {
    return { kind: "unsupported_schema_version", version };
  }

  if (!isManagedProviderConfigV1(parsed)) {
    return { kind: "corrupt", reason: "managed configuration file does not match the expected schema" };
  }

  return { kind: "ok", openaiApiKey: parsed.openai_api_key };
}

/**
 * The invariant that an unknown/future schema_version must never be
 * overwritten or deleted belongs to the store itself, not to any one caller
 * (a web route today; potentially other callers later) -- so both
 * writeManagedConfig and removeManagedConfig call this before touching the
 * file. Only a positively-confirmed unsupported/newer schema_version blocks
 * the mutation; every other pre-existing state (missing, unreadable,
 * malformed JSON, missing schema_version) is left to the mutation to proceed
 * as before -- this deliberately does not broaden into a new malformed-config
 * recovery architecture (the existing "Configure replaces a
 * corrupt/unreadable file" UX is unchanged), it only closes the one gap where
 * a schema this build doesn't understand could be silently clobbered.
 */
async function assertNoUnsupportedExistingSchema(path: string): Promise<void> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return; // missing, or unreadable for another reason -- not a confirmed future schema
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return; // malformed JSON is never a schema we could mistake for "future"
  }

  if (typeof parsed !== "object" || parsed === null) return;
  const version = (parsed as { schema_version?: unknown }).schema_version;
  if (version === undefined || version === SCHEMA_VERSION) return;

  throw new ProviderConfigError(
    "unsupported_managed_schema",
    "The existing managed configuration file uses a schema_version this version of the application does not recognize, so it will not be modified or removed.",
  );
}

async function ensureConfigDirExists(env: NodeJS.ProcessEnv): Promise<string> {
  const dir = resolveConfigDir(env);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    await chmod(dir, 0o700);
  } catch {
    // Best-effort: some filesystems/platforms don't support POSIX
    // permission bits (e.g. Windows) -- not a fatal condition.
  }
  return dir;
}

/**
 * Atomically persists the managed OpenAI API key: write a complete document
 * to a same-directory temp file, fsync it, apply restrictive permissions,
 * then atomically rename it over the target. A reader (the runner, or a
 * concurrent web request) can therefore only ever observe the complete
 * previous document or the complete new one -- never a partial write. Two
 * near-simultaneous calls resolve as last-completed-atomic-write-wins, by
 * design -- no interprocess lock is taken here.
 */
export async function writeManagedConfig(
  openaiApiKey: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const dir = await ensureConfigDirExists(env);
  const finalPath = join(dir, MANAGED_CONFIG_FILENAME);
  await assertNoUnsupportedExistingSchema(finalPath);
  const tempPath = join(dir, `.tmp-${MANAGED_CONFIG_FILENAME}-${randomBytes(8).toString("hex")}`);

  const doc: ManagedProviderConfigV1 = { schema_version: SCHEMA_VERSION, openai_api_key: openaiApiKey };
  const contents = JSON.stringify(doc);

  const handle = await open(tempPath, "w", 0o600);
  try {
    await handle.writeFile(contents, "utf-8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await chmod(tempPath, 0o600);
  } catch {
    // best-effort, matches ensureConfigDirExists's permission handling above
  }

  try {
    await rename(tempPath, finalPath);
  } catch (err) {
    await unlink(tempPath).catch(() => {
      /* best-effort cleanup */
    });
    throw err;
  }
}

/**
 * Removes the managed configuration file if present. A no-op, not an error,
 * if it's already absent (e.g. concurrent Remove calls, or Remove after the
 * file was never created) -- the accepted concurrency semantics for Remove.
 */
export async function removeManagedConfig(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = resolveManagedConfigPath(env);
  await assertNoUnsupportedExistingSchema(path);
  await rm(path, { force: true });
}
