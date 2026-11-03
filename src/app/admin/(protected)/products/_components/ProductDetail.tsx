"use client";

import { useState } from "react";
import { ArchiveIcon, ClockIcon, PencilIcon, ResetIcon } from "../../../../../components/icons";
import type { Product } from "../../../../../lib/api/products";
import ProductFormDialog from "./ProductFormDialog";
import ProductStatusDialog from "./ProductStatusDialog";
import { ProductMark, SlugChip, StatusBadge, formatDateTime } from "./ProductBits";
import styles from "../products.module.css";
import ui from "../../../_components/ui.module.css";

/** Details for one product, with the same edit / deactivate / restore flows as the list. */
export default function ProductDetail({ product }: { product: Product }) {
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <>
      <section className={styles.detailHero} data-inactive={!product.is_active}>
        <ProductMark name={product.name} slug={product.slug} size="lg" />
        <div className={styles.detailHeading}>
          <div className={styles.detailTitleRow}>
            <h1 className={styles.title}>{product.name}</h1>
            <StatusBadge active={product.is_active} />
          </div>
          <SlugChip slug={product.slug} />
        </div>
        <div className={styles.detailActions}>
          <button type="button" className={ui.secondaryButton} onClick={() => setEditing(true)}>
            <PencilIcon size={15} />
            Edit
          </button>
          {product.is_active ? (
            <button type="button" className={ui.dangerOutlineButton} onClick={() => setStatusOpen(true)}>
              <ArchiveIcon size={15} />
              Deactivate
            </button>
          ) : (
            <button type="button" className={ui.primaryButton} onClick={() => setStatusOpen(true)}>
              <ResetIcon size={15} />
              Restore
            </button>
          )}
        </div>
      </section>

      {!product.is_active && (
        <p className={styles.inactiveBanner} role="status">
          This product is inactive. It&apos;s hidden from active products until you restore it.
        </p>
      )}

      <div className={styles.detailGrid}>
        <section className={styles.card} aria-labelledby="description-title">
          <h2 id="description-title" className={styles.cardTitle}>
            Description
          </h2>
          {product.description ? (
            <p className={styles.descriptionText}>{product.description}</p>
          ) : (
            <p className={styles.muted}>
              No description yet.{" "}
              <button type="button" className={ui.textButton} onClick={() => setEditing(true)}>
                Add one
              </button>
            </p>
          )}
        </section>

        <section className={styles.card} aria-labelledby="details-title">
          <h2 id="details-title" className={styles.cardTitle}>
            Details
          </h2>
          <dl className={styles.meta}>
            <div>
              <dt>Status</dt>
              <dd>
                <StatusBadge active={product.is_active} />
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>
                <ClockIcon size={13} />
                <time dateTime={product.created_at}>{formatDateTime(product.created_at)}</time>
              </dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>
                <ClockIcon size={13} />
                <time dateTime={product.updated_at}>{formatDateTime(product.updated_at)}</time>
              </dd>
            </div>
            <div>
              <dt>Product ID</dt>
              <dd>
                <code className={styles.idCode}>{product.id}</code>
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <ProductFormDialog open={editing} product={product} onClose={() => setEditing(false)} />
      <ProductStatusDialog product={statusOpen ? product : null} onClose={() => setStatusOpen(false)} />
    </>
  );
}
