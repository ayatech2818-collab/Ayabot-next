"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  ArchiveIcon,
  ArrowRightIcon,
  CloseIcon,
  PackageIcon,
  PencilIcon,
  PlusIcon,
  ResetIcon,
  SearchIcon,
} from "../../../../../components/icons";
import type { Product } from "../../../../../lib/api/products";
import ProductFormDialog from "./ProductFormDialog";
import ProductStatusDialog from "./ProductStatusDialog";
import { ProductMark, SlugChip, StatusBadge, formatDate } from "./ProductBits";
import styles from "../products.module.css";
import ui from "../../../_components/ui.module.css";

type StatusFilter = "all" | "active" | "inactive";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

/**
 * Product list with search, status filter and the create/edit/deactivate/restore flows.
 * `products` comes from the server; server actions revalidate the page, so the list re-renders
 * with fresh data after every change instead of keeping a second copy in client state.
 */
export default function ProductsManager({ products, startWithCreate = false }: { products: Product[]; startWithCreate?: boolean }) {
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [createOpen, setCreateOpen] = useState(startWithCreate);
  const [editing, setEditing] = useState<Product | null>(null);
  const [statusTarget, setStatusTarget] = useState<Product | null>(null);

  const counts = useMemo(() => {
    const active = products.filter(product => product.is_active).length;
    return { all: products.length, active, inactive: products.length - active };
  }, [products]);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return products.filter(product => {
      if (filter === "active" && !product.is_active) return false;
      if (filter === "inactive" && product.is_active) return false;
      if (!needle) return true;
      return [product.name, product.slug, product.description ?? ""].some(value => value.toLowerCase().includes(needle));
    });
  }, [products, filter, deferredQuery]);

  const handleCloseForm = () => {
    setCreateOpen(false);
    setEditing(null);
    if (typeof window !== "undefined" && window.location.search.includes("new=1")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      window.history.replaceState(null, "", `${url.pathname}${url.search ? url.search : ""}`);
    }
  };

  return (
    <>
      <section className={styles.header}>
        <div>
          <p className={ui.eyebrow}>Catalogue</p>
          <h1 className={styles.title}>Products</h1>
          <p className={styles.subtitle}>Create and manage the products AYABOT serves across Ayadi.</p>
        </div>
        <button type="button" className={ui.primaryButton} onClick={() => setCreateOpen(true)}>
          <PlusIcon size={17} strokeWidth={2.4} />
          New product
        </button>
      </section>

      <section className={styles.metrics} aria-label="Product summary">
        <Metric label="Total products" value={counts.all} tone="blue" />
        <Metric label="Active" value={counts.active} tone="green" />
        <Metric label="Inactive" value={counts.inactive} tone="slate" />
      </section>

      <section className={styles.card} aria-labelledby="product-list-title">
        <h2 id="product-list-title" className={ui.srOnly}>
          Product list
        </h2>

        <div className={styles.toolbar}>
          <div className={styles.segmented} role="tablist" aria-label="Filter by status">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={styles.segment}
                onClick={() => setFilter(value)}
              >
                {label}
                <span className={styles.segmentCount}>{counts[value]}</span>
              </button>
            ))}
          </div>

          <label className={styles.search}>
            <SearchIcon size={16} />
            <span className={ui.srOnly}>Search products</span>
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search name, slug or description"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Clear search">
                <CloseIcon size={14} />
              </button>
            )}
          </label>
        </div>

        {products.length === 0 ? (
          <EmptyState
            title="No products yet"
            text="Create your first product to start configuring AYABOT for it."
            action={
              <button type="button" className={ui.primaryButton} onClick={() => setCreateOpen(true)}>
                <PlusIcon size={17} strokeWidth={2.4} />
                Create product
              </button>
            }
          />
        ) : visible.length === 0 ? (
          <EmptyState
            title="No matching products"
            text={query ? `Nothing matches “${query.trim()}” in ${filter === "all" ? "any" : filter} products.` : `There are no ${filter} products.`}
            action={
              <button
                type="button"
                className={ui.secondaryButton}
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <div className={styles.table} role="table" aria-label="Products">
            <div className={styles.tableHead} role="row">
              <span role="columnheader">Product</span>
              <span role="columnheader">Slug</span>
              <span role="columnheader">Status</span>
              <span role="columnheader">Created</span>
              <span role="columnheader" className={ui.srOnly}>
                Actions
              </span>
            </div>

            {visible.map(product => (
              <div key={product.id} className={styles.row} role="row" data-inactive={!product.is_active}>
                <div role="cell" className={styles.productCell}>
                  <ProductMark name={product.name} slug={product.slug} />
                  <div className={styles.productText}>
                    <Link href={`/admin/products/${product.id}`} className={styles.productName}>
                      {product.name}
                    </Link>
                    <p className={styles.productDescription}>{product.description || "No description"}</p>
                  </div>
                </div>
                <div role="cell" className={styles.slugCell}>
                  <SlugChip slug={product.slug} />
                </div>
                <div role="cell" className={styles.statusCell}>
                  <StatusBadge active={product.is_active} />
                </div>
                <div role="cell" className={styles.dateCell}>
                  <time dateTime={product.created_at}>{formatDate(product.created_at)}</time>
                </div>
                <div role="cell" className={styles.actionsCell}>
                  <button type="button" className={ui.iconButton} onClick={() => setEditing(product)} aria-label={`Edit ${product.name}`} title="Edit">
                    <PencilIcon size={15} />
                  </button>
                  {product.is_active ? (
                    <button
                      type="button"
                      className={ui.iconButton}
                      data-tone="danger"
                      onClick={() => setStatusTarget(product)}
                      aria-label={`Deactivate ${product.name}`}
                      title="Deactivate"
                    >
                      <ArchiveIcon size={15} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={ui.iconButton}
                      data-tone="success"
                      onClick={() => setStatusTarget(product)}
                      aria-label={`Restore ${product.name}`}
                      title="Restore"
                    >
                      <ResetIcon size={15} />
                    </button>
                  )}
                  <Link href={`/admin/products/${product.id}`} className={ui.iconButton} aria-label={`View ${product.name}`} title="View details">
                    <ArrowRightIcon size={15} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {visible.length > 0 && (
          <p className={styles.footnote}>
            Showing {visible.length} of {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        )}
      </section>

      <ProductFormDialog open={createOpen || Boolean(editing)} product={editing} onClose={handleCloseForm} />
      <ProductStatusDialog product={statusTarget} onClose={() => setStatusTarget(null)} />
    </>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "blue" | "green" | "slate" }) {
  return (
    <article className={styles.metric} data-tone={tone}>
      <span className={styles.metricIcon} aria-hidden="true">
        <PackageIcon size={18} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </article>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon} aria-hidden="true">
        <PackageIcon size={26} strokeWidth={1.6} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
