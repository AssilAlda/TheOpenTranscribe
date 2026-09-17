import styles from "./Brand.module.css";

export interface BrandProps {
  /** "default" for the home workspace header, "compact" for secondary pages like job detail. */
  size?: "default" | "compact";
}

/** The restrained CSS-only brand mark + wordmark shared across pages. No icon library/external logo. */
export function Brand({ size = "default" }: BrandProps) {
  return (
    <div className={`${styles.row} ${size === "compact" ? styles.compact : ""}`}>
      <span className={styles.mark} aria-hidden="true">
        <span className={styles.bar} style={{ height: "40%" }} />
        <span className={styles.bar} style={{ height: "100%" }} />
        <span className={styles.bar} style={{ height: "65%" }} />
      </span>
      <span className={styles.name}>TheOpenTranscribe</span>
    </div>
  );
}
