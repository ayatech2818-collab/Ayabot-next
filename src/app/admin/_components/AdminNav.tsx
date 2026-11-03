"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, ExternalLinkIcon, HomeIcon, PackageIcon } from "../../../components/icons";
import styles from "../admin.module.css";

type NavLink = { href: string; label: string; Icon: typeof HomeIcon; exact: boolean; hint?: string };

const LINKS: readonly NavLink[] = [
  { href: "/admin", label: "Overview", Icon: HomeIcon, exact: true },
  { href: "/admin/products", label: "Products", Icon: PackageIcon, exact: false },
  { href: "/admin/activity", label: "Activity logs", Icon: ActivityIcon, exact: false, hint: "Soon" },
];

function isActive(pathname: string, href: string, exact: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation() {
  const pathname = usePathname();

  return (
    <nav
      className={styles.navigation}
      aria-label="Admin navigation"
      // Inside the mobile <details> menu, close it once a link is chosen.
      onClick={event => {
        if ((event.target as HTMLElement).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open");
      }}
    >
      <p className={styles.navLabel}>Workspace</p>
      {LINKS.map(({ href, label, Icon, exact, hint }) => (
        <Link
          key={href}
          href={href}
          className={styles.navLink}
          aria-current={isActive(pathname, href, exact) ? "page" : undefined}
        >
          <Icon size={18} />
          <span>{label}</span>
          {hint && <span className={styles.navHint} data-tone="muted">{hint}</span>}
        </Link>
      ))}

      <p className={styles.navLabel}>Ayabot</p>
      <Link href="/" className={styles.navLink} target="_blank" rel="noopener noreferrer">
        <ExternalLinkIcon size={18} />
        <span>Open assistant</span>
        <span className={styles.navHint}>Live</span>
      </Link>
    </nav>
  );
}

/** Section name shown in the top bar, derived from the current route. */
export function PageContext() {
  const pathname = usePathname();
  const current = [...LINKS].reverse().find(link => isActive(pathname, link.href, link.exact));

  return (
    <div className={styles.pageContext}>
      <span className={styles.pageContextEyebrow}>Admin workspace</span>
      <strong>{current?.label ?? "Overview"}</strong>
    </div>
  );
}
