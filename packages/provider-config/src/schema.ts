/**
 * A minimal, schema-versioned JSON document for the managed `openai_api`
 * (CONFIGURATION-auth) credential. Persists only durable configuration -- the
 * managed key itself -- never the pre-save validation's
 * VALIDATED/UNVERIFIED/INVALID outcome or any verification metadata
 * (verified/verified_at/last_validation_error), since a past validation
 * result can go stale from revocation/permission/billing/IP changes on
 * OpenAI's side without this application ever knowing.
 *
 * This file must never later be reused for a future `openai_codex`
 * CONNECTED_ACCOUNT credential (access/refresh/id tokens, account IDs, OAuth
 * or PKCE state). Connected-account credentials, if ever supported, get
 * their own, separate, provider-specific storage.
 */

export const MANAGED_CONFIG_FILENAME = "provider-config.json";
export const SCHEMA_VERSION = 1 as const;

export interface ManagedProviderConfigV1 {
  schema_version: 1;
  openai_api_key: string;
}

export function isManagedProviderConfigV1(value: unknown): value is ManagedProviderConfigV1 {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schema_version === SCHEMA_VERSION &&
    typeof record.openai_api_key === "string" &&
    record.openai_api_key.length > 0
  );
}
