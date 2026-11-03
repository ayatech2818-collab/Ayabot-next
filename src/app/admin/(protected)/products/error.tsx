"use client";

import { useEffect } from "react";
import { AlertIcon } from "../../../../components/icons";
import styles from "./products.module.css";
import ui from "../../_components/ui.module.css";

// Shown inside the admin shell when products can't be loaded (backend down, 5xx, timeout).
export default function ProductsError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className={styles.card}>
      <div className={styles.empty} role="alert">
        <span className={styles.emptyIcon} data-tone="danger" aria-hidden="true">
          <AlertIcon size={26} strokeWidth={1.6} />
        </span>
        <h3>Couldn&apos;t load products</h3>
        <p>The AYABOT server couldn&apos;t be reached or returned an error. Your session is still active.</p>
        <button type="button" className={ui.primaryButton} onClick={() => unstable_retry()}>
          Try again
        </button>
      </div>
    </section>
  );
}
