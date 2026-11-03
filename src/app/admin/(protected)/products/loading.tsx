import styles from "./products.module.css";

export default function ProductsLoading() {
  return (
    <div className={styles.skeletonPage} aria-busy="true" aria-label="Loading products">
      <div className={styles.skeletonHeader}>
        <span className={styles.skeleton} style={{ width: 90, height: 12 }} />
        <span className={styles.skeleton} style={{ width: 220, height: 30 }} />
        <span className={styles.skeleton} style={{ width: 340, height: 14 }} />
      </div>
      <div className={styles.metrics}>
        {[0, 1, 2].map(i => (
          <span key={i} className={styles.skeleton} style={{ height: 88, borderRadius: 14 }} />
        ))}
      </div>
      <div className={styles.card}>
        <span className={styles.skeleton} style={{ height: 40, marginBottom: 18 }} />
        {[0, 1, 2, 3, 4].map(i => (
          <span key={i} className={styles.skeleton} style={{ height: 58, marginTop: 10 }} />
        ))}
      </div>
    </div>
  );
}
