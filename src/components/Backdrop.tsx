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

// Sparkles drifting up from the pedestal; deterministic so server and client markup match.
const SPARKS = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  style: {
    left: `${8 + ((i * 41) % 84)}%`,
    width: `${3 + (i % 3)}px`,
    height: `${3 + (i % 3)}px`,
    animationDelay: `${-((i * 0.83) % 7).toFixed(2)}s`,
    animationDuration: `${5.5 + ((i * 7) % 5) * 0.6}s`,
    "--drift": `${((i * 13) % 9) - 4}px`,
  } as React.CSSProperties,
}));

export default function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      {/* Glass-city scene (toggleable via <html data-scene>); positioned to sit behind Aya. */}
      <div className={styles.scene}>
        {/* "Living wallpaper": light touches pinned to features of the image (positions are
            percentages of the 1735x906 artwork) and animated with transform/opacity only. */}
        <span className={styles.liveSun} />
        <span className={styles.livePortal} />
        <span className={styles.liveSweep} />
        <span className={styles.liveSparkles}>
          {SPARKS.map(spark => (
            <i key={spark.id} style={spark.style} />
          ))}
        </span>
      </div>
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
