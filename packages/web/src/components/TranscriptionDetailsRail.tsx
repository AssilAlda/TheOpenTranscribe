import Link from "next/link";

import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES, extensionOf, formatBytes } from "@/lib/upload/constants";

import styles from "./TranscriptionDetailsRail.module.css";

export interface TranscriptionDetailsRailProps {
  /** Mirrors UploadPanel's own currently-selected file (null when none is selected). */
  file: File | null;
  /** Mirrors UploadPanel's own language field value. */
  language: string;
  /** True right after UploadPanel's onUploaded fires, until it resets itself back to idle. */
  justCreated: boolean;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <span className={styles.factLabel}>{label}</span>
      <span className={styles.factValue}>{value}</span>
    </div>
  );
}

/**
 * Secondary, read-only status panel to the right of the Transcribe workflow
 * on wide desktop screens -- fills the otherwise-empty space next to the
 * upload form's naturally constrained readable width without making that
 * form artificially full-width. Purely presentational: it never drives
 * UploadPanel, it only mirrors state UploadPanel already reports via its
 * (optional) onFileSelect/onLanguageChange/onUploaded callbacks.
 *
 * "Transcription details" is a real section heading (dark text, sentence
 * case, no eyebrow uppercase/tracking) at the top of the card, stable
 * across all three states below -- not the small muted uppercase eyebrow
 * this used to be, and not hoisted out to the page level either.
 */
export function TranscriptionDetailsRail({ file, language, justCreated }: TranscriptionDetailsRailProps) {
  return (
    <aside className={styles.rail} aria-labelledby="transcription-details-heading">
      <h2 id="transcription-details-heading" className={styles.heading}>
        Transcription details
      </h2>

      {justCreated ? (
        <div className={styles.section}>
          <p className={styles.successText}>Job created.</p>
          <Link href="/files" className={styles.successLink}>
            View in Transcribed Files →
          </Link>
        </div>
      ) : file ? (
        <div className={styles.section}>
          <Fact label="File" value={file.name} />
          <Fact label="Type" value={(extensionOf(file.name) || "file").toUpperCase()} />
          <Fact label="Size" value={formatBytes(file.size)} />
          {language.trim() !== "" && <Fact label="Language" value={language.trim()} />}
          <p className={styles.readyText}>Ready to transcribe</p>
        </div>
      ) : (
        <div className={styles.section}>
          <Fact label="Provider" value="OpenAI" />
          <Fact label="File size" value={`Up to ${formatBytes(MAX_UPLOAD_BYTES)}`} />
          <Fact label="Supported formats" value={ALLOWED_EXTENSIONS.map((ext) => ext.toUpperCase()).join(", ")} />
          <Fact label="Language" value="Optional" />
          <Fact label="Output" value="Transcript + PDF export" />
          <Fact label="Tracking" value="Transcribed Files" />
        </div>
      )}
    </aside>
  );
}
