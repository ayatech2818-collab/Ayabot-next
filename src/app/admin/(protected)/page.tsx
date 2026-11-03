import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRightIcon,
  ExternalLinkIcon,
  KeyIcon,
  PackageIcon,
  PlusIcon,
  ShieldIcon,
  SparkleIcon,
  UserIcon,
} from "../../../components/icons";
import { listCredentials } from "../../../lib/api/credentials";
import { listAllProducts, type Product } from "../../../lib/api/products";
import { credentialStatus } from "../../../lib/products/credentialValidation";
import { redirectOnAuthError, requireAdmin } from "../../../lib/auth/admin";
import styles from "../admin.module.css";

export const metadata: Metadata = { title: "Dashboard" };

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

/** Keys are stored per product, so the overview asks each product (in parallel, capped). */
const KEY_SUMMARY_PRODUCT_LIMIT = 25;

type KeySummary = {
  active: number;
  expired: number;
  revoked: number;
  /** Products with at least one usable key, most keys first. */
  topProducts: { product: Product; active: number }[];
  /** True when some products were skipped or failed, so the numbers are a lower bound. */
  partial: boolean;
};

async function loadKeySummary(products: Product[]): Promise<KeySummary> {
  const scanned = products.slice(0, KEY_SUMMARY_PRODUCT_LIMIT);
  const results = await Promise.all(
    scanned.map(async product => {
      try {
        return { product, credentials: await listCredentials(product.id, { includeInactive: true }) };
      } catch (error) {
        redirectOnAuthError(error);
        return { product, credentials: null };
      }
    }),
  );

  const summary: KeySummary = { active: 0, expired: 0, revoked: 0, topProducts: [], partial: products.length > scanned.length };
  for (const { product, credentials } of results) {
    if (!credentials) {
      summary.partial = true;
      continue;
    }
    let active = 0;
    for (const credential of credentials) {
      const status = credentialStatus(credential);
      summary[status]++;
      if (status === "active") active++;
    }
    if (active) summary.topProducts.push({ product, active });
  }
  summary.topProducts.sort((a, b) => b.active - a.active);
  return summary;
}

/** Summaries for the overview cards; a failure here shouldn't take down the whole dashboard. */
async function loadOverview() {
  let products: Product[];
  try {
    products = await listAllProducts({ includeInactive: true });
  } catch (error) {
    redirectOnAuthError(error);
    return { productCounts: null, keySummary: null, activeProducts: [] as Product[] };
  }
  const activeProducts = products.filter(product => product.is_active);
  return {
    productCounts: { total: products.length, active: activeProducts.length },
    keySummary: await loadKeySummary(products),
    activeProducts,
  };
}

export default async function AdminDashboardPage() {
  // Same cached call as the layout - no extra backend request.
  const { user, admin } = await requireAdmin();
  const role = admin.role === "super_admin" ? "Super admin" : "Admin";
  const displayName = admin.display_name || user.email?.split("@")[0] || "Administrator";
  const memberSince = dateFormat.format(new Date(admin.created_at));
  const { productCounts, keySummary, activeProducts } = await loadOverview();
  // With a single active product, "Manage API keys" can jump straight to its keys.
  const keysHref = activeProducts.length === 1 ? `/admin/products/${activeProducts[0].id}#credentials` : "/admin/products";

  return (
    <>
      <section className={styles.pageHeading}>
        <div>
          <p className={styles.eyebrow}>Overview</p>
          <h1 className={styles.pageTitle}>Welcome back, {displayName}</h1>
          <p className={styles.pageSubtitle}>Manage AYABOT from one secure workspace.</p>
        </div>
        <Link href="/" target="_blank" rel="noopener noreferrer" className={styles.primaryAction}>
          <ExternalLinkIcon size={17} />
          Open Ayabot
        </Link>
      </section>

      <section className={styles.statGrid} aria-label="Admin account summary">
        <article className={styles.statCard}>
          <span className={styles.statIcon} data-tone="green"><ShieldIcon size={20} /></span>
          <div><p>Account status</p><strong>Active</strong></div>
          <span className={styles.statusBadge}>Verified</span>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statIcon} data-tone="violet"><UserIcon size={20} /></span>
          <div><p>Access level</p><strong>{role}</strong></div>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statIcon} data-tone="blue"><SparkleIcon size={20} /></span>
          <div><p>Admin since</p><strong>{memberSince}</strong></div>
        </article>
      </section>

      <div className={styles.dashboardGrid}>
        <div className={styles.overviewColumn}>
          <section className={styles.panel} aria-labelledby="workspace-title">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.sectionLabel}>Catalogue</p>
                <h2 id="workspace-title" className={styles.panelTitle}>Products</h2>
              </div>
              <span className={styles.readyPill}><span /> Ready</span>
            </div>
            {productCounts ? (
              <dl className={styles.productSummary}>
                <div><dt>Total</dt><dd>{productCounts.total}</dd></div>
                <div><dt>Active</dt><dd>{productCounts.active}</dd></div>
                <div><dt>Inactive</dt><dd>{productCounts.total - productCounts.active}</dd></div>
              </dl>
            ) : (
              <p className={styles.panelCopy}>Product counts are unavailable right now. Open Products to retry.</p>
            )}
            <div className={styles.actionList}>
              <Link href="/admin/products" className={styles.actionRow}>
                <span className={styles.actionRowIcon}><PackageIcon size={18} /></span>
                <span><strong>Manage products</strong><small>Search, edit, deactivate and restore products</small></span>
                <ArrowRightIcon size={18} />
              </Link>
              <Link href="/admin/products?new=1" className={styles.actionRow}>
                <span className={styles.actionRowIcon}><PlusIcon size={18} /></span>
                <span><strong>Create a product</strong><small>Add a new product for AYABOT to serve</small></span>
                <ArrowRightIcon size={18} />
              </Link>
              <Link href="/" target="_blank" rel="noopener noreferrer" className={styles.actionRow}>
                <span className={styles.actionRowIcon}><ExternalLinkIcon size={18} /></span>
                <span><strong>Preview public assistant</strong><small>Open the live AYABOT experience in a new tab</small></span>
                <ArrowRightIcon size={18} />
              </Link>
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="api-keys-title">
            <div className={styles.panelHeader}>
              <div>
                <p className={styles.sectionLabel}>Integrations</p>
                <h2 id="api-keys-title" className={styles.panelTitle}>API keys</h2>
              </div>
              <span className={styles.panelIcon} aria-hidden="true"><KeyIcon size={18} /></span>
            </div>
            {keySummary ? (
              <>
                <dl className={styles.productSummary}>
                  <div><dt>Active</dt><dd>{keySummary.active}</dd></div>
                  <div><dt>Expired</dt><dd>{keySummary.expired}</dd></div>
                  <div><dt>Revoked</dt><dd>{keySummary.revoked}</dd></div>
                </dl>
                {keySummary.partial && (
                  <p className={styles.panelNote}>Some products couldn&apos;t be checked, so these counts may be incomplete.</p>
                )}
                {keySummary.topProducts.length > 0 && (
                  <ul className={styles.keyProducts} aria-label="Products with active API keys">
                    {keySummary.topProducts.slice(0, 3).map(({ product, active }) => (
                      <li key={product.id}>
                        <Link href={`/admin/products/${product.id}#credentials`}>
                          <span>{product.name}</span>
                          <small>{active} active key{active === 1 ? "" : "s"}</small>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className={styles.panelCopy}>API key counts are unavailable right now. Open a product to retry.</p>
            )}
            <Link href={keysHref} className={styles.actionRow}>
              <span className={styles.actionRowIcon}><KeyIcon size={18} /></span>
              <span>
                <strong>Manage API keys</strong>
                <small>{activeProducts.length === 1 ? `Generate and revoke keys for ${activeProducts[0].name}` : "Pick a product to generate or revoke its keys"}</small>
              </span>
              <ArrowRightIcon size={18} />
            </Link>
          </section>
        </div>

        <section id="account" className={styles.panel} aria-labelledby="account-title">
          <div className={styles.panelHeader}>
            <div>
              <p className={styles.sectionLabel}>Profile</p>
              <h2 id="account-title" className={styles.panelTitle}>Account &amp; access</h2>
            </div>
          </div>
          <dl className={styles.accountDetails}>
            <div><dt>Display name</dt><dd>{admin.display_name || "Not set"}</dd></div>
            <div><dt>Email address</dt><dd>{user.email ?? "—"}</dd></div>
            <div><dt>Role</dt><dd>{role}</dd></div>
            <div><dt>Member since</dt><dd>{memberSince}</dd></div>
          </dl>
        </section>
      </div>

      <section className={styles.securityNote}>
        <ShieldIcon size={18} />
        <div><strong>Protected administration area</strong><p>Your session is verified against the AYABOT admin service before this workspace is shown.</p></div>
      </section>
    </>
  );
}
