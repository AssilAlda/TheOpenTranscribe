import {
  ProviderConfigError,
  removeManagedConfig,
  resolveOpenAIConfig,
  toSafeProviderStatus,
  writeManagedConfig,
} from "@theopentranscribe/provider-config";

import { apiErrorToResponse, ApiError, dataResponse, errorResponse } from "@/lib/http";
import { isRequestOriginTrusted } from "@/lib/provider/origin";
import { withProviderSecurityHeaders } from "@/lib/provider/httpHardening";
import { readBoundedJsonBody } from "@/lib/provider/readJsonBody";
import { validateOpenAIKey } from "@/lib/provider/validateOpenAIKey";

// Node.js runtime, matching every other Route Handler that touches
// filesystem/subprocess-adjacent server-side state.
export const runtime = "nodejs";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * writeManagedConfig/removeManagedConfig throw a typed, secret-free
 * ProviderConfigError when an existing managed-config file's schema_version
 * is unsupported/newer than this build understands, so the mutation was
 * refused. Maps that specific, known-safe error to a 409 response; every
 * other ProviderConfigError code (e.g. an unrelated configDir
 * misconfiguration) falls through to apiErrorToResponse's generic 500
 * handling.
 */
function providerConfigErrorToResponse(err: unknown): Response | null {
  if (err instanceof ProviderConfigError && err.code === "unsupported_managed_schema") {
    return errorResponse(409, err.code, err.message);
  }
  return null;
}

/**
 * Rejects a mutation if the environment owns the credential (env is
 * authoritative and UI-locked -- the application never offers to overwrite
 * or remove it). Shared by POST and DELETE below.
 */
async function assertManagedMutationAllowed(): Promise<void> {
  const resolved = await resolveOpenAIConfig();
  if (resolved.kind === "configured" && resolved.source === "environment") {
    throw new ApiError(
      409,
      "environment_locked",
      "OPENAI_API_KEY is set in the server environment and cannot be changed from the Provider page.",
    );
  }
}

/**
 * GET /api/provider/openai -- safe status only (DTO shape:
 * configured/source/locked). Never returns a raw credential, and is never
 * cacheable.
 */
export async function GET(): Promise<Response> {
  try {
    const resolved = await resolveOpenAIConfig();
    return withProviderSecurityHeaders(dataResponse(toSafeProviderStatus(resolved), 200));
  } catch (err) {
    return withProviderSecurityHeaders(apiErrorToResponse(err));
  }
}

/**
 * POST /api/provider/openai -- Configure (when unconfigured) or Replace (when
 * already managed): both are the same upsert operation server-side,
 * distinguished only by the Provider UI's copy/entry point, never by a
 * different API shape. Validates the candidate (validateOpenAIKey) before
 * persisting; an INVALID candidate is never written and never disturbs an
 * existing managed key.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    if (!isRequestOriginTrusted(request)) {
      throw new ApiError(403, "untrusted_origin", "This request's Origin is not trusted.");
    }

    await assertManagedMutationAllowed();

    const body = await readBoundedJsonBody(request);
    const candidate = (body as { openai_api_key?: unknown } | null)?.openai_api_key;
    if (!isNonEmptyString(candidate)) {
      throw new ApiError(
        400,
        "invalid_candidate",
        "openai_api_key is required and must be a non-empty string.",
      );
    }

    const validation = await validateOpenAIKey(candidate.trim());
    if (validation.outcome === "invalid") {
      throw new ApiError(422, "invalid_credential", "OpenAI rejected this API key as invalid.");
    }

    // VALIDATED and UNVERIFIED persist identically -- no structural
    // difference in storage between the two outcomes. Only the response
    // below carries the distinction, and it is never itself persisted.
    await writeManagedConfig(candidate.trim());

    const resolvedAfter = await resolveOpenAIConfig();
    const status = toSafeProviderStatus(resolvedAfter);
    return withProviderSecurityHeaders(
      dataResponse({ ...status, validation: validation.outcome }, 200),
    );
  } catch (err) {
    return withProviderSecurityHeaders(providerConfigErrorToResponse(err) ?? apiErrorToResponse(err));
  }
}

/**
 * DELETE /api/provider/openai -- removes the managed credential only.
 * Never accepts or requires a credential-bearing body -- the server already
 * owns the managed state, so there is no "prove ownership by sending the key
 * back" round-trip.
 */
export async function DELETE(request: Request): Promise<Response> {
  try {
    if (!isRequestOriginTrusted(request)) {
      throw new ApiError(403, "untrusted_origin", "This request's Origin is not trusted.");
    }

    await assertManagedMutationAllowed();
    await removeManagedConfig();

    const resolvedAfter = await resolveOpenAIConfig();
    return withProviderSecurityHeaders(dataResponse(toSafeProviderStatus(resolvedAfter), 200));
  } catch (err) {
    return withProviderSecurityHeaders(providerConfigErrorToResponse(err) ?? apiErrorToResponse(err));
  }
}
