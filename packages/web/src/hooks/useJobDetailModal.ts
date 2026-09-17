"use client";

import { useCallback, useRef, useState } from "react";

export interface UseJobDetailModalResult {
  openJobId: string | null;
  /** Opens the modal for jobId, remembering triggerElement for deterministic focus restoration on close. */
  open: (jobId: string, triggerElement: HTMLElement) => void;
  /** Closes the modal, restoring focus to the triggering element (or the fallback) -- see fallbackFocusRef. */
  close: () => void;
}

/**
 * Owns which job's detail modal is open and, critically, deterministic
 * focus restoration -- not reliant on a browser's own implicit "return
 * focus to whatever triggered showModal()" behavior (unenforced in some
 * environments, including jsdom, so untestable if relied upon alone).
 *
 * `fallbackFocusRef` should point to a stable heading/landmark on the
 * hosting page (e.g. Transcribed Files' own <h1>) -- used only if the
 * original triggering element is no longer in the DOM when close() runs
 * (e.g. it scrolled out via pagination or a poll refresh removed it).
 */
export function useJobDetailModal(
  fallbackFocusRef: React.RefObject<HTMLElement | null>,
): UseJobDetailModalResult {
  const [openJobId, setOpenJobId] = useState<string | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const open = useCallback((jobId: string, triggerElement: HTMLElement) => {
    triggerElementRef.current = triggerElement;
    setOpenJobId(jobId);
  }, []);

  const close = useCallback(() => {
    setOpenJobId(null);

    const trigger = triggerElementRef.current;
    triggerElementRef.current = null;

    if (trigger && trigger.isConnected) {
      trigger.focus();
    } else {
      fallbackFocusRef.current?.focus();
    }
  }, [fallbackFocusRef]);

  return { openJobId, open, close };
}
