"use client";

import { useTransition } from "react";
import { ArchiveIcon, ResetIcon } from "../../../../../components/icons";
import type { Product } from "../../../../../lib/api/products";
import Modal from "../../../_components/Modal";
import { useToast } from "../../../_components/Toaster";
import { deactivateProductAction, restoreProductAction } from "../actions";
import ui from "../../../_components/ui.module.css";

type ProductStatusDialogProps = {
  product: Product | null;
  onClose: () => void;
  onChanged?: (product: Product) => void;
};

/** Confirms deactivating an active product, or restoring an inactive one. */
export default function ProductStatusDialog({ product, onClose, onChanged }: ProductStatusDialogProps) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const deactivating = product?.is_active ?? true;

  const confirm = () => {
    if (!product) return;
    startTransition(async () => {
      try {
        const result = deactivating
          ? await deactivateProductAction(product.id)
          : await restoreProductAction(product.id);

        if (result.ok) {
          toast.success({
            title: deactivating ? "Product deactivated" : "Product restored",
            description: deactivating
              ? `${result.product.name} is now hidden from active products.`
              : `${result.product.name} is active again.`,
          });
          onChanged?.(result.product);
        } else {
          toast.error({ title: deactivating ? "Couldn't deactivate product" : "Couldn't restore product", description: result.error });
        }
      } catch {
        toast.error({ title: "Something went wrong", description: "Check your connection and try again." });
      }
      onClose();
    });
  };

  return (
    <Modal
      open={Boolean(product)}
      onClose={onClose}
      busy={pending}
      size="sm"
      tone={deactivating ? "danger" : "default"}
      icon={deactivating ? <ArchiveIcon size={18} /> : <ResetIcon size={18} />}
      title={deactivating ? "Deactivate product?" : "Restore product?"}
      footer={
        <>
          <button type="button" className={ui.secondaryButton} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={deactivating ? ui.dangerButton : ui.primaryButton}
            onClick={confirm}
            disabled={pending}
            aria-busy={pending}
            autoFocus
          >
            {pending && <span className={ui.spinner} aria-hidden="true" />}
            {deactivating ? (pending ? "Deactivating…" : "Deactivate") : pending ? "Restoring…" : "Restore"}
          </button>
        </>
      }
    >
      {product && (
        <p className={ui.modalCopy}>
          {deactivating ? (
            <>
              <strong>{product.name}</strong> will be marked inactive and hidden from active products. Its data is kept,
              and you can restore it at any time.
            </>
          ) : (
            <>
              <strong>{product.name}</strong> will become active again and appear with your active products.
            </>
          )}
        </p>
      )}
    </Modal>
  );
}
