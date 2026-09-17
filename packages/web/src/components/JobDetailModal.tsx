"use client";

import { useEffect, useRef } from "react";

import { CloseIcon } from "./icons";
import { JobStatusDetail } from "./JobStatusDetail";
import { ModalErrorBoundary } from "./ModalErrorBoundary";
import styles from "./JobDetailModal.module.css";

export interface JobDetailModalProps {
  /** The open job's id, or null when the modal should be closed. */
  jobId: string | null;
  onClose: () => void;
}

/**
 * Large, premium job-detail dialog -- the normal interaction from
 * Transcribed Files. Built on the native <dialog> element + showModal():
 * real focus trap, Escape-to-close, and an inert background all come free
 * from the browser. Focus *restoration* on close is handled by the caller
 * (useJobDetailModal), not by this component or by implicit browser
 * behavior -- this component only ever calls dialog.close(); a single
 * native "close" event listener is the one unified path that then calls
 * onClose(), regardless of whether the close was triggered by the button,
 * Escape/cancel, or any future programmatic close.
 */
export function JobDetailModal({ jobId, onClose }: JobDetailModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (jobId && !dialog.open) {
      dialog.showModal();
      // Explicit, not reliant on the browser's own default dialog-focusing
      // steps (which some test/runtime environments don't fully implement).
      closeButtonRef.current?.focus();

      // Body scroll lock: this effect is the sole owner of it, acquiring
      // the lock here and releasing it via exactly one function used on
      // both of its release paths below. Capturing and restoring the
      // actual previous value -- not assuming it was always "" -- means
      // this never clobbers a lock some other body-level UI already held
      // before this modal opened.
      const previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      function releaseBodyScrollLock() {
        document.body.style.overflow = previousBodyOverflow;
      }

      // Release path 1 -- the dialog's own native "close" event: fires for
      // the close button (which just calls dialog.close()), Escape/cancel,
      // and any future programmatic close. Tied directly to the event
      // itself, not to `jobId` flipping back to null on some later
      // render -- releasing the lock must not depend on the caller
      // actually re-rendering this component with a new `jobId`.
      dialog.addEventListener("close", releaseBodyScrollLock, { once: true });

      // Release path 2 -- this effect's own cleanup, which React runs on
      // unmount even if "close" never fired. This is what makes the lock
      // safe when the whole component is torn down while the dialog is
      // still open (e.g. a Sidebar/MobileTabBar navigation away from
      // /files without closing the modal first) -- the <dialog> is removed
      // directly in that case, so the native "close" event never fires.
      // Calling this a second time after path 1 already ran is harmless:
      // it just reassigns the same captured value.
      return () => {
        dialog.removeEventListener("close", releaseBodyScrollLock);
        releaseBodyScrollLock();
      };
    }

    if (!jobId && dialog.open) {
      dialog.close();
    }
  }, [jobId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    // The one unified close path: fires for the close button, Escape/
    // cancel, and any future programmatic close -- all end up here exactly
    // once. Only notifies the caller; the body scroll lock (above) is
    // released independently of this.
    function handleClose() {
      onClose();
    }

    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  return (
    <dialog ref={dialogRef} className={styles.dialog} aria-label="Job details">
      <div className={styles.chrome}>
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
        {jobId && (
          <ModalErrorBoundary key={jobId}>
            <JobStatusDetail jobId={jobId} />
          </ModalErrorBoundary>
        )}
      </div>
    </dialog>
  );
}
