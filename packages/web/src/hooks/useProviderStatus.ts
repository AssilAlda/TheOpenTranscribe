"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "@/lib/apiClient";

/**
 * Mirrors the server's safe status DTO (@theopentranscribe/provider-config's
 * SafeProviderStatus) -- never a raw credential. `source` is locked to
 * exactly these three values (blockers B2/B4); a managed-configuration
 * failure is represented by the sibling `configError` flag alongside
 * `source: "unconfigured"`, never by a fourth `source` value.
 */
export interface ProviderStatus {
  configured: boolean;
  source: "environment" | "managed" | "unconfigured";
  locked: boolean;
  configError?: true;
}

export interface UseProviderStatusResult {
  status: ProviderStatus | null;
  loading: boolean;
  error: string | null;
  /** Re-fetches from the server -- the only source of truth for this state (Owner Decision 5 §9). */
  refresh: () => Promise<void>;
}

/**
 * Fetches GET /api/provider/openai on mount and exposes a manual refresh.
 * The frontend never invents credential state independently -- every status
 * value shown to the operator comes directly from this fetch, including
 * after a Configure/Replace/Remove mutation or an ambiguous transport
 * failure during one (Owner Decision 5 §9, CORRECTION 2 §2C).
 */
export function useProviderStatus(): UseProviderStatusResult {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const body = await apiRequest<{ data: ProviderStatus }>("/api/provider/openai");
      if (mountedRef.current) {
        setStatus(body.data);
        setError(null);
      }
    } catch {
      if (mountedRef.current) {
        setError("Couldn't load provider status. Retrying won't send any credential.");
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  return { status, loading, error, refresh };
}
