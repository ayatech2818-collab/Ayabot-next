import Link from "next/link";
import { PackageIcon } from "../../../../../components/icons";
import styles from "../products.module.css";
import ui from "../../../_components/ui.module.css";

export default function ProductNotFound() {
  return (
    <section className={styles.card}>
      <div className={styles.empty}>
        <span className={styles.emptyIcon} aria-hidden="true">
          <PackageIcon size={26} strokeWidth={1.6} />
        </span>
        <h3>Product not found</h3>
        <p>This product doesn&apos;t exist or its link is incorrect.</p>
        <Link href="/admin/products" className={ui.primaryButton}>
          Back to products
        </Link>
      </div>
    </section>
  );
}
