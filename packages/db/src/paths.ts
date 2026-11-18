/**
 * DATA_DIR resolution and path-safety helpers for application-managed
 * storage. Mirrors the DATA_DIR-relative path rules already enforced by the
 * job contract (packages/contract/python/theopentranscribe_contract/job.py:
 * _is_data_dir_relative_path) so the same shape of path is accepted on both
 * sides of the contract.
 *
 * Scope: this module only knows about the fixed DATA_DIR layout
 * (uploads/, outputs/, the sqlite file). It does not perform upload handling,
 * size limits, or extension allowlisting — that is packages/web's job.
 */

import { mkdirSync } from "node:fs";
import { resolve, sep } from "node:path";

export const DATA_DIR_DB_FILENAME = "theopentranscribe.sqlite3";
export const DATA_DIR_UPLOADS_SUBDIR = "uploads";
export const DATA_DIR_OUTPUTS_SUBDIR = "outputs";

export class PathSafetyError extends Error {}

/**
 * Resolves and returns an absolute DATA_DIR path. Requires an explicit path
 * (no implicit default) — this package does not decide what DATA_DIR should
 * default to; that is a decision for whatever process wires it up (the
 * runner/web app, or a test).
 */
export function resolveDataDir(dataDirPath: string): string {
  if (!dataDirPath || dataDirPath.trim() === "") {
    throw new PathSafetyError("DATA_DIR must be a non-empty path");
  }
  return resolve(dataDirPath);
}

export function dbFilePath(dataDir: string): string {
  return resolve(resolveDataDir(dataDir), DATA_DIR_DB_FILENAME);
}

/**
 * Ensures the fixed DATA_DIR layout exists: DATA_DIR itself, plus
 * its uploads/ and outputs/ subdirectories. The sqlite file and its WAL/SHM
 * siblings are created by SQLite itself on first open, not here.
 */
export function ensureDataDirLayout(dataDir: string): string {
  const root = resolveDataDir(dataDir);
  mkdirSync(root, { recursive: true });
  mkdirSync(resolve(root, DATA_DIR_UPLOADS_SUBDIR), { recursive: true });
  mkdirSync(resolve(root, DATA_DIR_OUTPUTS_SUBDIR), { recursive: true });
  return root;
}

/**
 * Validates that `relativePath` is a safe, DATA_DIR-relative path: no leading
 * slash/backslash, no drive letter, no ".." segments. Matches the contract's
 * media_path/output_path shape (job.py: _is_data_dir_relative_path).
 */
export function isDataDirRelativePath(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("/") || value.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  const segments = value.split(/[\\/]/);
  if (segments.some((segment) => segment === "..")) return false;
  return true;
}

/**
 * Resolves a DATA_DIR-relative path against DATA_DIR and verifies the result
 * stays within DATA_DIR. Defense in depth beyond isDataDirRelativePath's
 * shape check, in case of encoded/odd inputs.
 */
export function resolveWithinDataDir(dataDir: string, relativePath: string): string {
  if (!isDataDirRelativePath(relativePath)) {
    throw new PathSafetyError(
      `path is not a valid DATA_DIR-relative path: ${JSON.stringify(relativePath)}`,
    );
  }
  const root = resolveDataDir(dataDir);
  const resolved = resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new PathSafetyError(
      `path escapes DATA_DIR: ${JSON.stringify(relativePath)}`,
    );
  }
  return resolved;
}

/**
 * Strips any directory components and replaces characters outside a safe
 * allowlist so a caller-supplied original filename can never be interpreted
 * as a path. Never trust a user-supplied filename as a path.
 */
export function sanitizeFilenameSegment(originalFilename: string): string {
  const baseNameOnly = originalFilename.split(/[\\/]/).pop() ?? "";
  const sanitized = baseNameOnly.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
  return sanitized.length > 0 ? sanitized : "file";
}

/** Builds the DATA_DIR-relative upload path for a job's source media file. */
export function buildUploadRelativePath(jobId: string, originalFilename: string): string {
  const safeName = sanitizeFilenameSegment(originalFilename);
  return `${DATA_DIR_UPLOADS_SUBDIR}/${jobId}__${safeName}`;
}

/** Builds the DATA_DIR-relative output path for a job's transcript. */
export function buildOutputRelativePath(jobId: string): string {
  return `${DATA_DIR_OUTPUTS_SUBDIR}/${jobId}.txt`;
}
