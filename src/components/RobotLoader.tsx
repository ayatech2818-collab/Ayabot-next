import styles from "./RobotLoader.module.css";

type RobotLoaderProps = {
  label: string;
  /** 0..100; omit to hide the progress bar. */
  progress?: number;
  /** Smaller variant used for the quick full-screen transition veil. */
  compact?: boolean;
};

/** Branded loading visual: orbiting rings around a mini Aya face. */
export default function RobotLoader({ label, progress, compact = false }: RobotLoaderProps) {
  const percent = progress === undefined ? undefined : Math.round(Math.min(100, Math.max(0, progress)));

  return (
    <div className={styles.loader} data-compact={compact} role="status" aria-live="polite">
      <div className={styles.orbit} aria-hidden="true">
        <span className={styles.ringOuter} />
        <span className={styles.ringMiddle} />
        <span className={styles.ringInner} />
        <span className={styles.spark} />
        <div className={styles.head}>
          <div className={styles.visor}>
            <span className={styles.eye} />
            <span className={styles.eye} />
            <span className={styles.smile} />
          </div>
        </div>
      </div>

      <p className={styles.label}>
        {label}
        <span className={styles.dots} aria-hidden="true" />
      </p>

      {percent !== undefined && (
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label="Loading Aya"
        >
          <span className={styles.progressFill} style={{ "--p": percent / 100 } as React.CSSProperties} />
          <span className={styles.progressValue}>{percent}%</span>
        </div>
      )}
    </div>
  );
}
