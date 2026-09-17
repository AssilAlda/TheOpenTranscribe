"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDownloadTranscriptPdf } from "@/hooks/useDownloadTranscriptPdf";

import styles from "./TranscriptReader.module.css";

type TranscriptFetchState = "loading" | "loaded" | "error";

export function TranscriptReader({ jobId }: { jobId: string }) {
  const [state, setState] = useState<TranscriptFetchState>("loading");
  const [transcript, setTranscript] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { state: pdfState, errorMessage: pdfError, download } = useDownloadTranscriptPdf(jobId);

  const loadTranscript = useCallback(async () => {
    setState("loading");
    setFetchError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/result`);
      if (!res.ok) {
        throw new Error("The transcript couldn't be retrieved.");
      }
      const text = await res.text();
      setTranscript(text);
      setState("loaded");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "The transcript couldn't be retrieved.");
      setState("error");
    }
  }, [jobId]);

  useEffect(() => {
    // Fetched once per job; treated as immutable for the page session once loaded.
    void loadTranscript();
  }, [loadTranscript]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    if (!transcript) return;
    try {
      await navigator.clipboard.writeText(transcript);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
    copyTimeoutRef.current = setTimeout(() => setCopyState("idle"), 2200);
  }, [transcript]);

  return (
    <section className={styles.section} aria-labelledby="transcript-heading">
      <div className={styles.headerRow}>
        <h2 id="transcript-heading" className={styles.heading}>
          Transcript
        </h2>

        {state === "loaded" && (
          <div className={styles.actions}>
            <button type="button" className={styles.actionButton} onClick={handleCopy}>
              {copyState === "copied" ? "Copied" : copyState === "failed" ? "Couldn't copy" : "Copy"}
            </button>
            <button
              type="button"
              className={`${styles.actionButton} ${styles.actionButtonPrimary}`}
              onClick={download}
              disabled={pdfState === "generating"}
            >
              {pdfState === "generating" ? "Generating…" : "Download PDF"}
            </button>
          </div>
        )}

        <span className={styles.srOnly} role="status" aria-live="polite">
          {copyState === "copied" ? "Copied to clipboard" : ""}
        </span>
      </div>

      {pdfState === "error" && pdfError && (
        <p className={styles.pdfError} role="alert">
          {pdfError}{" "}
          <button type="button" className={styles.retryLink} onClick={download}>
            Try again
          </button>
        </p>
      )}

      {state === "loading" && (
        <div className={styles.loading} aria-hidden="true">
          <div className={styles.skeletonLine} style={{ width: "95%" }} />
          <div className={styles.skeletonLine} style={{ width: "88%" }} />
          <div className={styles.skeletonLine} style={{ width: "92%" }} />
          <div className={styles.skeletonLine} style={{ width: "60%" }} />
        </div>
      )}

      {state === "error" && (
        <div className={styles.transcriptError} role="alert">
          <p>{fetchError}</p>
          <button type="button" className={styles.retryButton} onClick={() => void loadTranscript()}>
            Retry
          </button>
        </div>
      )}

      {state === "loaded" && transcript !== null && (
        <div className={styles.reader}>
          <p className={styles.readerText}>{transcript}</p>
        </div>
      )}
    </section>
  );
}
