/**
 * Layered secret redaction. This is the shared pattern library consumed by
 * packages/runner's stderr-capture boundary (the mandatory backstop for
 * subprocess diagnostics) and by packages/web's OpenAI-validation error path
 * -- one implementation, not two independently maintained regex sets. Defense
 * in depth, not a cryptographic guarantee: a novel secret format or
 * unexpected diagnostic shape may still evade heuristic matching, which is
 * exactly why callers are also expected to avoid raw exception dumps and
 * prefer structured safe diagnostics wherever they can.
 *
 * Redaction failure-safety is the caller's responsibility: wrap calls to
 * redactSecretText in a try/catch and fall back to a safe generic message on
 * any unexpected error -- never fall back to the raw, unredacted input.
 */

const REDACTED = "[REDACTED]";

// Authorization headers and bare "Bearer <token>" occurrences.
const AUTHORIZATION_HEADER_PATTERN = /authorization\s*:\s*(bearer|basic)\s+\S+/gi;
const BARE_BEARER_PATTERN = /\bbearer\s+[a-zA-Z0-9._~+/=-]{8,}/gi;

// Generic structured key/value secrets. Not dependent on any one provider's
// exact key prefix (e.g. "sk-") -- OpenAI's key format may evolve, and this
// also covers a future CONNECTED_ACCOUNT provider's access/refresh tokens
// without requiring a redesign.
const SECRET_KEY_VALUE_PATTERN =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|password|secret)\b"?\s*[:=]\s*"?[a-zA-Z0-9._~+/=-]{4,}"?/gi;

/**
 * Redacts known secret material from `text`. `knownSecrets` (e.g. the
 * credential a job just resolved) are redacted by exact-value match first,
 * ahead of the generic pattern matching below -- this catches a raw key
 * even if it appears somewhere a regex heuristic wouldn't anticipate.
 * Never persists or logs `knownSecrets` itself; callers must only ever pass
 * the in-memory value they already hold for the current operation.
 */
export function redactSecretText(text: string, knownSecrets: readonly string[] = []): string {
  if (typeof text !== "string" || text.length === 0) return text;

  let result = text;

  for (const secret of knownSecrets) {
    if (secret && secret.length >= 4) {
      result = result.split(secret).join(REDACTED);
    }
  }

  result = result.replace(AUTHORIZATION_HEADER_PATTERN, `Authorization: ${REDACTED}`);
  result = result.replace(BARE_BEARER_PATTERN, `Bearer ${REDACTED}`);
  result = result.replace(SECRET_KEY_VALUE_PATTERN, (_match, key: string) => `${key}=${REDACTED}`);

  return result;
}
