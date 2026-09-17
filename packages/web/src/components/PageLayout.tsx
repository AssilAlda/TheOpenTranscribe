import { forwardRef, type ReactNode } from "react";

import styles from "./PageLayout.module.css";

export interface PageLayoutProps {
  /** Exact application-section title shown in the shared page header. */
  title: string;
  /** Forwarded to the header's <h1> -- lets a page use it as an aria-labelledby target. */
  headingId?: string;
  children: ReactNode;
}

/**
 * Shared shell for the three primary destinations (Transcribe, Transcribed
 * Files, Provider): a compact page header (title + border-bottom, spanning
 * the main canvas) above a content region that starts at the same left
 * inset on every page. Lives inside AppShell's <main> canvas -- AppShell
 * itself stays responsible only for the sidebar/mobile nav/canvas, not
 * per-page chrome.
 *
 * The header's <h1> accepts a forwarded ref so a page can also use it as a
 * deterministic focus-restoration fallback target (see Transcribed Files +
 * useJobDetailModal), instead of duplicating a second heading just for that.
 */
export const PageLayout = forwardRef<HTMLHeadingElement, PageLayoutProps>(function PageLayout(
  { title, headingId, children },
  headingRef,
) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 id={headingId} ref={headingRef} tabIndex={-1} className={styles.title}>
          {title}
        </h1>
      </header>
      <div className={styles.content}>{children}</div>
    </div>
  );
});
