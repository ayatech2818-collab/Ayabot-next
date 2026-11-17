import productStyles from "../products/products.module.css";
import styles from "./knowledge.module.css";

export default function KnowledgeLoading() {
  return (
    <div className={productStyles.skeletonPage} aria-busy="true" aria-label="Loading knowledge base">
      <div className={productStyles.skeletonHeader}>
        <span className={productStyles.skeleton} style={{ width: 90, height: 12 }} />
        <span className={productStyles.skeleton} style={{ width: 240, height: 30 }} />
        <span className={productStyles.skeleton} style={{ width: 380, maxWidth: "100%", height: 14 }} />
      </div>
      <div className={styles.metrics}>
        {[0, 1, 2, 3].map(i => (
          <span key={i} className={productStyles.skeleton} style={{ height: 88, borderRadius: 14 }} />
        ))}
      </div>
      <div className={productStyles.card}>
        <span className={productStyles.skeleton} style={{ height: 40, marginBottom: 18 }} />
        {[0, 1, 2, 3, 4].map(i => (
          <span key={i} className={productStyles.skeleton} style={{ height: 62, marginTop: 10 }} />
        ))}
      </div>
    </div>
  );
}
