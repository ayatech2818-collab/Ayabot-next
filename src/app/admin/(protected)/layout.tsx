import Link from "next/link";
import ThemeSwitcher from "../../../components/ThemeSwitcher";
import { LogOutIcon, MenuIcon, ShieldIcon } from "../../../components/icons";
import { requireAdmin } from "../../../lib/auth/admin";
import { logout } from "../actions";
import { AdminNavigation, PageContext } from "../_components/AdminNav";
import { ToastProvider } from "../_components/Toaster";
import styles from "../admin.module.css";

const ROLE_LABELS = { super_admin: "Super admin", admin: "Admin" } as const;

function Brand() {
  return (
    <Link href="/admin" className={styles.brand} aria-label="AYABOT admin overview">
      <span className={styles.brandLogo} aria-hidden="true">
        <span className={styles.brandOrbit} />
        <ShieldIcon size={19} strokeWidth={2.1} />
      </span>
      <span className={styles.brandCopy}>
        <strong>AYABOT</strong>
        <span>Admin console</span>
      </span>
    </Link>
  );
}

/** Every route in this group requires an active AYABOT admin, verified by FastAPI /auth/me. */
export default async function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, admin } = await requireAdmin();
  const name = admin.display_name || user.email || "Administrator";
  const role = ROLE_LABELS[admin.role];

  return (
    <div className={styles.shell}>
      <a href="#admin-content" className={styles.skipLink}>Skip to content</a>

      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}><Brand /></div>
        <AdminNavigation />
        <div className={styles.sidebarFooter}>
          <div className={styles.sidebarUser}>
            <span className={styles.avatar} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
            <span className={styles.userMeta}>
              <span className={styles.userName}>{name}</span>
              <span className={styles.userRole}>{role}</span>
            </span>
          </div>
          <form action={logout}>
            <button type="submit" className={styles.signOutButton}>
              <LogOutIcon size={17} />
              <span>Sign out</span>
            </button>
          </form>
        </div>
      </aside>

      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.mobileBrand}><Brand /></div>
          <PageContext />

          <div className={styles.topbarActions}>
            <ThemeSwitcher />
            <div className={styles.headerUser} title={`${name} · ${role}`}>
              <span className={styles.avatar} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
              <span className={styles.headerUserCopy}>
                <span>{name}</span>
                <small>{role}</small>
              </span>
            </div>
            <details className={styles.mobileMenu}>
              <summary aria-label="Open admin navigation"><MenuIcon size={20} /></summary>
              <div className={styles.mobileMenuPanel}>
                <AdminNavigation />
                <form action={logout}>
                  <button type="submit" className={styles.signOutButton}>
                    <LogOutIcon size={17} />
                    <span>Sign out</span>
                  </button>
                </form>
              </div>
            </details>
          </div>
        </header>

        <main id="admin-content" className={styles.content}>
          <ToastProvider>{children}</ToastProvider>
        </main>
      </div>
    </div>
  );
}
