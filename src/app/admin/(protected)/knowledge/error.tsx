"use client";

import { useEffect } from "react";
import { AlertIcon } from "../../../../components/icons";
import productStyles from "../products/products.module.css";
import ui from "../../_components/ui.module.css";

// Shown inside the admin shell when the product list can't be loaded (backend down, 5xx, timeout).
// A failure loading only the documents is handled inside the page, with its own retry.
export default function KnowledgeError({
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
    <section className={productStyles.card}>
      <div className={productStyles.empty} role="alert">
        <span className={productStyles.emptyIcon} data-tone="danger" aria-hidden="true">
          <AlertIcon size={26} strokeWidth={1.6} />
        </span>
        <h3>Couldn&apos;t load the knowledge base</h3>
        <p>The AYABOT server couldn&apos;t be reached or returned an error. Your session is still active.</p>
        <button type="button" className={ui.primaryButton} onClick={() => unstable_retry()}>
          Try again
        </button>
      </div>
    </section>
  );
}
