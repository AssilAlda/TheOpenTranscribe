/**
 * Active pre-save validation with fail-open on ambiguity.
 *
 * Uses GET /v1/me (per official OpenAI documentation) -- OpenAI's documented
 * account-information endpoint for identifying the user/organizations
 * associated with an API key -- rather than GET /v1/models. /v1/me is
 * semantically aligned with "can this credential authenticate?"; /v1/models
 * is a resource-listing endpoint that may be subject to endpoint-specific
 * restricted-key permissions unrelated to whether the credential itself is
 * valid. Never makes a transcription/audio request merely to validate a key.
 * A successful call only proves authentication for that one request -- it
 * does NOT guarantee transcription permission, billing, quota, model access,
 * or future availability, and /v1/me's identity/org response fields are never
 * persisted, logged, or returned to the browser (only this function's own
 * safe outcome/detail is ever surfaced further).
 *
 * Fails OPEN on ambiguity, deliberately so: current official OpenAI
 * documentation (platform.openai.com's error-codes guide) does NOT document a
 * stable `error.code` field distinguishing a bad API key on a 401 response --
 * its three documented 401 cases ("Invalid Authentication", "Incorrect API
 * key provided", "You must be a member of an organization...") carry no
 * machine-readable code in the docs, only descriptive messages. OpenAI's
 * documentation also confirms a *valid* key can receive a 401 with
 * `error.code === "ip_not_authorized"` when IP allowlisting blocks the
 * request -- so a 401 is never, by itself, proof the credential is invalid.
 * Since no stable, officially-documented structured invalid-key indicator
 * exists to substantiate an "invalid" classification, this never classifies
 * ANY response as "invalid" -- every 401 (and every other non-2xx/network/
 * timeout outcome) is "unverified", not "invalid". `OpenAIValidationOutcome`
 * keeps the "invalid" member (the three-way validation contract, and the
 * route/UI's existing 422 rejection path both stay in place) so that a
 * future, genuinely-documented stable signal can be wired back in with a
 * citation -- but nothing in this function currently produces it. It is
 * acceptable for v1 to save a clearly suspicious-but-not-authoritatively-
 * classifiable credential as "unverified"; the runtime remains authoritative.
 */

export type OpenAIValidationOutcome = "validated" | "invalid" | "unverified";

export interface OpenAIValidationResult {
  outcome: OpenAIValidationOutcome;
  /** A safe, non-secret diagnostic category for logs -- never the raw response body. */
  detail: string;
}

const VALIDATION_TIMEOUT_MS = 8000;
const ME_ENDPOINT = "https://api.openai.com/v1/me";

export async function validateOpenAIKey(candidateKey: string): Promise<OpenAIValidationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(ME_ENDPOINT, {
      method: "GET",
      headers: { Authorization: `Bearer ${candidateKey}` },
      signal: controller.signal,
    });

    if (response.ok) {
      // Deliberately never reads/returns the identity/org response body --
      // only that the request authenticated is ever used.
      return { outcome: "validated", detail: "account_lookup_succeeded" };
    }

    if (response.status === 401) {
      // No stable, officially-documented `error.code` distinguishes a bad
      // key from e.g. ip_not_authorized (a valid key, blocked by IP
      // allowlisting) -- see the file-level comment. Always ambiguous.
      return { outcome: "unverified", detail: "unauthorized_ambiguous" };
    }

    // 403 (permission-scoped key), 429 (rate limit), 5xx (outage), and any
    // other status are all ambiguous -- none are specific evidence that the
    // credential itself is invalid.
    return { outcome: "unverified", detail: `http_${response.status}` };
  } catch (err) {
    const reason = err instanceof Error && err.name === "AbortError" ? "timeout" : "network_error";
    return { outcome: "unverified", detail: reason };
  } finally {
    clearTimeout(timeout);
  }
}
