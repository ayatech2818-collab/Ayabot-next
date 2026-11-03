import type { Metadata } from "next";
import { redirect } from "next/navigation";
import ThemeSwitcher from "../../../components/ThemeSwitcher";
import { ShieldIcon } from "../../../components/icons";
import { getAccessToken } from "../../../lib/api/server";
import { fetchCurrentAdmin, safeNextPath, type SignOutReason } from "../../../lib/auth/admin";
import LoginForm from "./LoginForm";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<SignOutReason, { tone: "info" | "warning"; text: string }> = {
  expired: { tone: "warning", text: "Your session has expired. Please sign in again." },
  forbidden: {
    tone: "warning",
    text: "Your account no longer has access to AYABOT administration. Contact a super admin if this is unexpected.",
  },
  signed_out: { tone: "info", text: "You've been signed out." },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

async function isSignedInAdmin() {
  const token = await getAccessToken();
  if (!token) return false;
  try {
    await fetchCurrentAdmin(token);
    return true;
  } catch {
    return false;
  }
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next, reason } = await searchParams;
  const nextPath = safeNextPath(next);

  // Already signed in as an admin: skip the form.
  if (await isSignedInAdmin()) redirect(nextPath);

  const notice = typeof reason === "string" ? NOTICES[reason as SignOutReason] : undefined;

  return (
    <main className={styles.authPage}>
      <div className={styles.authTheme}>
        <ThemeSwitcher />
      </div>

      <section className={styles.authCard} aria-labelledby="login-title">
        <header className={styles.authHeader}>
          <span className={styles.brandMark} aria-hidden="true">
            <ShieldIcon size={22} strokeWidth={1.9} />
          </span>
          <p className={styles.eyebrow}>AYABOT Admin Console</p>
          <h1 id="login-title" className={styles.authTitle}>
            Sign in to continue
          </h1>
          <p className={styles.authSubtitle}>Use your administrator email and password.</p>
        </header>

        {notice && (
          <p className={styles.notice} data-tone={notice.tone} role="status">
            {notice.text}
          </p>
        )}

        <LoginForm nextPath={nextPath} />

        <p className={styles.authFootnote}>Access is restricted to authorized AYABOT administrators.</p>
      </section>
    </main>
  );
}
