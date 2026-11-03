import type { Metadata } from "next";
import Link from "next/link";
import { ActivityIcon, ArrowLeftIcon } from "../../../../components/icons";
import styles from "../../admin.module.css";

export const metadata: Metadata = { title: "Activity logs" };

// Placeholder until the backend exposes an activity/audit endpoint. Intentionally shows no data.
export default function ActivityLogsPage() {
  return (
    <>
      <section className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Audit</p>
          <h1 className={styles.pageTitle}>Activity logs</h1>
          <p className={styles.pageSubtitle}>A record of changes made in the AYABOT admin console.</p>
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="activity-soon-title">
        <div className={styles.comingSoon}>
          <span className={styles.comingSoonIcon} aria-hidden="true">
            <ActivityIcon size={28} strokeWidth={1.8} />
          </span>
          <span className={styles.soonPill}>Coming soon</span>
          <h2 id="activity-soon-title">Activity logs are on the way</h2>
          <p>
            Soon you&apos;ll be able to see who changed what, and when: product updates, API key generation and
            revocations, and admin sign-ins.
          </p>
          <Link href="/admin" className={styles.ghostButton}>
            <ArrowLeftIcon size={16} />
            Back to overview
          </Link>
        </div>
      </section>
    </>
  );
}
