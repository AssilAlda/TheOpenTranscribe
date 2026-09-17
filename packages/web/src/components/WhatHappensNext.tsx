import styles from "./WhatHappensNext.module.css";

const STEPS = [
  { title: "Upload", body: "Your media is added as a transcription job." },
  { title: "Transcription", body: "Follow its status in Transcribed Files." },
  { title: "Review & export", body: "Read the transcript, copy it, or download it as PDF." },
] as const;

/**
 * Compact, stable companion card to TranscriptionDetailsRail -- the real
 * three-step workflow, stated once. Deliberately state-independent (no
 * props): it doesn't change with the current file/upload state, only
 * Transcription details does.
 */
export function WhatHappensNext() {
  return (
    <aside className={styles.card} aria-labelledby="what-happens-next-heading">
      <h2 id="what-happens-next-heading" className={styles.title}>
        What happens next
      </h2>

      <ol className={styles.steps}>
        {STEPS.map((step, index) => (
          <li key={step.title} className={styles.step}>
            <span className={styles.stepNumber} aria-hidden="true">
              {index + 1}
            </span>
            <div className={styles.stepBody}>
              <p className={styles.stepTitle}>{step.title}</p>
              <p className={styles.stepText}>{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </aside>
  );
}
