import styles from "./Backdrop.module.css";

// Deterministic star positions so server and client render the same markup.
const STARS = Array.from({ length: 70 }, (_, i) => ({
  id: i,
  size: i % 9 === 0 ? 2.4 : i % 3 === 0 ? 1.7 : 1.1,
  style: {
    left: `${((i * 37 + 13) % 98) + 1}%`,
    top: `${((i * 59 + 7) % 92) + 1}%`,
    animationDelay: `${((i * 23) % 40) / 10}s`,
    animationDuration: `${6 + ((i * 17) % 60) / 10}s`,
  },
}));

export default function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      {/* Glass-city scene (toggleable via <html data-scene>); positioned to sit behind Aya. */}
      <div className={styles.scene} />
      <div className={styles.sceneTint} />
      <div className={styles.glowA} />
      <div className={styles.glowB} />
      <div className={styles.grid} />
      <div className={styles.stars}>
        {STARS.map(star => (
          <span
            key={star.id}
            className={styles.star}
            style={{ ...star.style, width: star.size, height: star.size }}
          />
        ))}
      </div>
    </div>
  );
}
