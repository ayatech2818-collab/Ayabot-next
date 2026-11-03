"use client";

import { useEffect } from "react";
import { AlertIcon } from "../../components/icons";
import styles from "./admin.module.css";

// Catches failures from the protected layout and pages - most often the FastAPI backend being
// unreachable. The session is left intact so a retry can succeed without signing in again.
export default function AdminError({
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
    <main className={styles.authPage}>
      <section className={styles.authCard} role="alert">
        <header className={styles.authHeader}>
          <span className={styles.brandMark} data-tone="danger" aria-hidden="true">
            <AlertIcon size={22} strokeWidth={1.9} />
          </span>
          <h1 className={styles.authTitle}>Can&apos;t load the admin console</h1>
          <p className={styles.authSubtitle}>
            The AYABOT server couldn&apos;t be reached or returned an error. Check your connection and try again.
          </p>
        </header>
        <div className={styles.errorActions}>
          <button type="button" className={styles.primaryButton} onClick={() => unstable_retry()}>
            Try again
          </button>
          <a className={styles.ghostButton} href="/admin/auth/sign-out?reason=signed_out">
            Sign out
          </a>
        </div>
      </section>
    </main>
  );
}
