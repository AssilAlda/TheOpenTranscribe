"use client";

import Link from "next/link";
import { useCallback, useId, useRef, useState } from "react";

import type { JobDocumentLike } from "@theopentranscribe/db";

import { apiRequest } from "@/lib/apiClient";
import {
  ALLOWED_EXTENSIONS,
  MAX_UPLOAD_BYTES,
  formatBytes,
  isAllowedExtension,
  extensionOf,
} from "@/lib/upload/constants";

import { CloseIcon, UploadIcon } from "./icons";
import styles from "./UploadPanel.module.css";

type UploadState = "idle" | "selected" | "uploading" | "success" | "error";

function clientValidationHint(file: File): string | null {
  if (!isAllowedExtension(file.name)) {
    return `File type not supported. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return `File is larger than the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`;
  }
  return null;
}

export interface UploadPanelProps {
  onUploaded: (job: JobDocumentLike) => void;
  /** Optional -- lets a host page (e.g. Transcribe's contextual rail) mirror the selected file without controlling this component. */
  onFileSelect?: (file: File | null) => void;
  /** Optional -- same mirroring for the language field. */
  onLanguageChange?: (language: string) => void;
}

export function UploadPanel({ onUploaded, onFileSelect, onLanguageChange }: UploadPanelProps) {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const languageInputId = useId();
  const fileInputId = useId();

  const selectFile = useCallback(
    (candidate: File | null) => {
      if (!candidate) return;
      setFile(candidate);
      setHint(clientValidationHint(candidate));
      setErrorMessage(null);
      setState("selected");
      onFileSelect?.(candidate);
    },
    [onFileSelect],
  );

  const reset = useCallback(() => {
    setFile(null);
    setHint(null);
    setErrorMessage(null);
    setLanguage("");
    setState("idle");
    if (inputRef.current) inputRef.current.value = "";
    onFileSelect?.(null);
    onLanguageChange?.("");
  }, [onFileSelect, onLanguageChange]);

  const handleSubmit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!file || state === "uploading") return;

      setState("uploading");
      setErrorMessage(null);

      const formData = new FormData();
      formData.append("file", file);
      if (language.trim() !== "") {
        formData.append("language", language.trim());
      }

      try {
        const body = await apiRequest<{ data: JobDocumentLike }>("/api/jobs", {
          method: "POST",
          body: formData,
        });
        setState("success");
        onUploaded(body.data);
        window.setTimeout(() => {
          reset();
        }, 1600);
      } catch (err) {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Upload failed. Please try again.");
      }
    },
    [file, language, onUploaded, reset, state],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      dragDepthRef.current = 0;
      setIsDragOver(false);
      const dropped = event.dataTransfer.files?.[0] ?? null;
      selectFile(dropped);
    },
    [selectFile],
  );

  const handleDragEnter = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current += 1;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const isBusy = state === "uploading";
  const isDone = state === "success";

  return (
    <section className={styles.panel} aria-labelledby="upload-heading">
      <h2 id="upload-heading" className={styles.heading}>
        Upload
      </h2>

      <form onSubmit={handleSubmit} className={styles.form}>
        {!file && (
          <div
            className={`${styles.dropzone} ${isDragOver ? styles.dropzoneActive : ""}`}
            onDrop={handleDrop}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            {/* 28 -> 32px: more presence for the bespoke rising-bars glyph
                inside the unchanged 56px circular container (still 12px of
                breathing room on every side). */}
            <span className={styles.dropzoneIcon}>
              <UploadIcon size={32} />
            </span>
            <p className={styles.dropzoneTitle}>Drop your file here</p>
            <p className={styles.dropzoneOr}>or</p>
            <p className={styles.dropzoneSubtitle}>
              <span className={styles.dropzoneChooseLink}>choose a file</span>
            </p>
          </div>
        )}

        <input
          ref={inputRef}
          id={fileInputId}
          type="file"
          className={styles.hiddenInput}
          accept={ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",")}
          onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
          disabled={isBusy}
        />

        {file && (
          <div className={styles.selectedFile}>
            <span className={styles.fileTypeBadge}>{extensionOf(file.name) || "file"}</span>
            <div className={styles.selectedFileInfo}>
              <p className={styles.selectedFileName}>{file.name}</p>
              <p className={styles.selectedFileMeta}>
                {formatBytes(file.size)}
                {!isBusy && !isDone && (
                  <>
                    {" "}
                    &middot; <span className={styles.readyText}>Ready to transcribe</span>
                  </>
                )}
                {isDone && (
                  <>
                    {" "}
                    &middot; <span className={styles.readyText}>Uploaded</span>
                  </>
                )}
              </p>
            </div>
            {!isBusy && !isDone && (
              <div className={styles.selectedFileActions}>
                <button
                  type="button"
                  className={styles.changeButton}
                  onClick={() => inputRef.current?.click()}
                >
                  Change
                </button>
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={reset}
                  aria-label="Remove selected file"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
          </div>
        )}

        {hint && !isDone && <p className={styles.warningText}>{hint}</p>}

        <div className={styles.controlsRow}>
          <div className={styles.fieldGroup}>
            <label htmlFor={languageInputId} className={styles.label}>
              Language <span className={styles.labelOptional}>(optional)</span>
            </label>
            <input
              id={languageInputId}
              type="text"
              className={styles.textInput}
              placeholder="e.g. sv, en"
              value={language}
              onChange={(event) => {
                setLanguage(event.target.value);
                onLanguageChange?.(event.target.value);
              }}
              disabled={isBusy}
            />
          </div>

          <button type="submit" className={styles.submitButton} disabled={!file || isBusy || isDone}>
            {isBusy && <span className={styles.spinner} aria-hidden="true" />}
            {isBusy ? "Uploading…" : isDone ? "Uploaded" : "Start transcription"}
          </button>
        </div>

        {isDone && (
          <p className={styles.successText} role="status">
            Job created.{" "}
            <Link href="/files" className={styles.successLink}>
              View transcribed files →
            </Link>
          </p>
        )}
        {state === "error" && errorMessage && (
          <p className={styles.errorText} role="alert">
            {errorMessage}
          </p>
        )}
      </form>
    </section>
  );
}
