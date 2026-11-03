import type { Metadata } from "next";
import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: {
    default: "AYABOT Admin",
    template: "%s · AYABOT Admin",
  },
  description: "Secure administration workspace for AYABOT.",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className={styles.root}>{children}</div>;
}
