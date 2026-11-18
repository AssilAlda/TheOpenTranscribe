"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CloseIcon } from "./icons";
import styles from "./OpenAICredentialModal.module.css";

export type CredentialModalMode = "configure" | "replace";

type SaveResult =
  | { kind: "validated" }
  | { kind: "unverified" }
  | { kind: "invalid"; message: string }
  | { kind: "transport_error" }
  | { kind: "error"; message: string };

export interface OpenAICredentialModalProps {
  mode: CredentialModalMode | null;
  onClose: () => void;
  /** Called after ANY mutation attempt settles (success, invalid, or transport failure) so the caller can re-fetch safe status. */
  onSettled: () => void;
}

/**
 * Dedicated native <dialog> for Configure/Replace, reusing
 * JobDetailModal's established interaction pattern (showModal, Escape-to-
 * close, inert background, deterministic focus restoration, body-scroll
 * lock with two independent release paths) rather than a second modal
 * architecture. Always starts with a BLANK input -- the existing stored key
 * is never fetched or populated: there is no "edit existing value" semantics,
 * only "submit a new candidate."
 */
export function OpenAICredentialModal({ mode, onClose, onSettled }: OpenAICredentialModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();

  const [candidate, setCandidate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const isOpen = mode !== null;

  // Reset transient form state every time the modal is (re)opened -- a
  // Replace after a previous Configure must never inherit stale state, and
  // the candidate must never be pre-filled from a prior session.
  useEffect(() => {
    if (isOpen) {
      setCandidate("");
      setSubmitting(false);
      setResult(null);
      setShowSecret(false);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) {
      dialog.showModal();
      inputRef.current?.focus();

      const previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      function releaseBodyScrollLock() {
        document.body.style.overflow = previousBodyOverflow;
      }
      dialog.addEventListener("close", releaseBodyScrollLock, { once: true });
      return () => {
        dialog.removeEventListener("close", releaseBodyScrollLock);
        releaseBodyScrollLock();
      };
    }

    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    function handleClose() {
      onClose();
      onSettled();
    }
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose, onSettled]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const trimmed = candidate.trim();
    if (!trimmed) return;

    setSubmitting(true);
    setResult(null);

    let response: Response;
    try {
      response = await fetch("/api/provider/openai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ openai_api_key: trimmed }),
      });
    } catch {
      // The browser's own connection to TheOpenTranscribe failed before any
      // server response was read. This is NOT a server-side key-validation
      // outcome -- never claim "saved, unverified" here. The caller
      // reconciles durable state via a status refetch once the modal closes
      // (onSettled below).
      setSubmitting(false);
      setResult({ kind: "transport_error" });
      return;
    }

    const body: unknown = await response.json().catch(() => null);
    setSubmitting(false);

    if (!response.ok) {
      if (response.status === 422) {
        setResult({ kind: "invalid", message: "OpenAI rejected this API key as invalid." });
      } else {
        const message =
          (body as { error?: { message?: string } } | null)?.error?.message ??
          "Something went wrong. Please try again.";
        setResult({ kind: "error", message });
      }
      return;
    }

    const validation = (body as { data?: { validation?: string } } | null)?.data?.validation;
    setResult(validation === "validated" ? { kind: "validated" } : { kind: "unverified" });
  }

  const title = mode === "replace" ? "Replace OpenAI API key" : "Configure OpenAI API";

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label={title}>
      <div className={styles.chrome}>
        <h2 className={styles.title}>{title}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className={styles.closeButton}
          onClick={() => dialogRef.current?.close()}
          aria-label="Close"
        >
          <CloseIcon size={18} />
        </button>
      </div>

      <div className={styles.body}>
        <p className={styles.explainer}>
          {mode === "replace"
            ? "The existing managed key stays active unless this replacement is accepted. It is never shown here."
            : "Stored only on this server as managed configuration -- never in job records, logs, or your browser."}
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label htmlFor={inputId} className={styles.label}>
            OpenAI API key
          </label>
          <div className={styles.inputRow}>
            <input
              ref={inputRef}
              id={inputId}
              className={styles.textInput}
              type={showSecret ? "text" : "password"}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={candidate}
              onChange={(event) => setCandidate(event.target.value)}
              disabled={submitting}
              placeholder="sk-..."
            />
            <button
              type="button"
              className={styles.toggleVisibility}
              onClick={() => setShowSecret((value) => !value)}
              aria-pressed={showSecret}
              aria-label={showSecret ? "Hide API key" : "Show API key"}
            >
              {showSecret ? "Hide" : "Show"}
            </button>
          </div>

          {result?.kind === "validated" && (
            <p className={styles.resultOk} role="status">
              Saved and verified with OpenAI.
            </p>
          )}
          {result?.kind === "unverified" && (
            <p className={styles.resultWarn} role="status">
              Saved, but this key could not be actively verified right now (this can happen during a
              network issue or a temporary OpenAI outage -- it does not necessarily mean the key is
              invalid).
            </p>
          )}
          {result?.kind === "invalid" && (
            <p className={styles.resultError} role="alert">
              {result.message} The previous configuration, if any, was not changed.
            </p>
          )}
          {result?.kind === "transport_error" && (
            <p className={styles.resultError} role="alert">
              Couldn&rsquo;t reach TheOpenTranscribe to save this key. Nothing is confirmed saved or not
              saved -- close this dialog and the Provider page will show the current state.
            </p>
          )}
          {result?.kind === "error" && (
            <p className={styles.resultError} role="alert">
              {result.message}
            </p>
          )}

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={() => dialogRef.current?.close()}>
              {result?.kind === "validated" || result?.kind === "unverified" ? "Done" : "Cancel"}
            </button>
            <button
              type="submit"
              className={styles.saveButton}
              disabled={submitting || candidate.trim().length === 0}
            >
              {submitting ? "Saving…" : mode === "replace" ? "Save replacement" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}
