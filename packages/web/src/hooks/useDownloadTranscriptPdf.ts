"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type DownloadPdfState = "idle" | "generating" | "error";

export interface UseDownloadTranscriptPdfResult {
  state: DownloadPdfState;
  errorMessage: string | null;
  download: () => void;
}

function friendlyMessageFor(status: number, code: string | undefined): string {
  if (status === 409) return "This job hasn't finished yet.";
  if (status === 422 || code === "unsupported_pdf_characters") {
    return "This transcript contains characters that can't be exported to PDF yet.";
  }
  if (status === 404) return "This job could not be found.";
  return "Couldn't generate the PDF. Please try again.";
}

/**
 * Drives the "Download PDF" action against GET /api/jobs/:jobId/result/pdf:
 * fetch -> check response.ok -> Blob -> temporary object URL -> trigger
 * browser download -> revoke the object URL. No client-side PDF library --
 * generation is entirely server-side; this hook only ever handles the
 * resulting bytes as an opaque Blob. De-dupes overlapping clicks and aborts
 * an in-flight request if the component unmounts first.
 */
export function useDownloadTranscriptPdf(jobId: string): UseDownloadTranscriptPdfResult {
  const [state, setState] = useState<DownloadPdfState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const download = useCallback(() => {
    if (state === "generating") return; // de-dupe overlapping clicks

    const controller = new AbortController();
    abortRef.current = controller;
    setState("generating");
    setErrorMessage(null);

    void (async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}/result/pdf`, { signal: controller.signal });

        if (!res.ok) {
          let code: string | undefined;
          try {
            const body = (await res.json()) as { error?: { code?: string } };
            code = body.error?.code;
          } catch {
            // No JSON body available -- fall back to a generic message below.
          }
          throw new Error(friendlyMessageFor(res.status, code));
        }

        const blob = await res.blob();
        if (!mountedRef.current) return;

        const dispositionFilename = res.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1];

        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = dispositionFilename ?? "transcript.pdf";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(objectUrl);

        if (mountedRef.current) setState("idle");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (!mountedRef.current) return;
        setErrorMessage(
          err instanceof Error ? err.message : "Couldn't generate the PDF. Please try again.",
        );
        setState("error");
      }
    })();
  }, [jobId, state]);

  return { state, errorMessage, download };
}
