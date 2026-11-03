"use client";

import { useState, useTransition } from "react";
import { AlertIcon, PackageIcon, PencilIcon } from "../../../../../components/icons";
import type { Product } from "../../../../../lib/api/products";
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  SLUG_MAX,
  slugify,
  validateProductValues,
  type ProductField,
  type ProductFieldErrors,
  type ProductFormValues,
} from "../../../../../lib/products/validation";
import Modal from "../../../_components/Modal";
import { useToast } from "../../../_components/Toaster";
import { createProductAction, updateProductAction } from "../actions";
import ui from "../../../_components/ui.module.css";

type ProductFormDialogProps = {
  open: boolean;
  /** Edit this product; omit to create a new one. */
  product?: Product | null;
  onClose: () => void;
  onSaved?: (product: Product) => void;
};

const EMPTY: ProductFormValues = { name: "", slug: "", description: "" };

function toValues(product?: Product | null): ProductFormValues {
  return product ? { name: product.name, slug: product.slug, description: product.description ?? "" } : EMPTY;
}

export default function ProductFormDialog({ open, product, onClose, onSaved }: ProductFormDialogProps) {
  const isEdit = Boolean(product);
  const [pending, startTransition] = useTransition();

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={pending}
      icon={isEdit ? <PencilIcon size={18} /> : <PackageIcon size={18} />}
      title={isEdit ? "Edit product" : "Create product"}
      description={isEdit ? "Update how this product is named and identified." : "Add a product that AYABOT can serve."}
    >
      {/* Keyed so each open starts from fresh values. */}
      {open && (
        <ProductForm
          key={product?.id ?? "new"}
          product={product}
          pending={pending}
          startTransition={startTransition}
          onCancel={onClose}
          onSaved={saved => {
            onSaved?.(saved);
            onClose();
          }}
        />
      )}
    </Modal>
  );
}

function ProductForm({
  product,
  pending,
  startTransition,
  onCancel,
  onSaved,
}: {
  product?: Product | null;
  pending: boolean;
  startTransition: React.TransitionStartFunction;
  onCancel: () => void;
  onSaved: (product: Product) => void;
}) {
  const toast = useToast();
  const original = toValues(product);
  const [values, setValues] = useState<ProductFormValues>(original);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Partial<Record<ProductField, boolean>>>({});
  // New products derive the slug from the name until the admin edits the slug themselves.
  const [slugLinked, setSlugLinked] = useState(!product);

  const update = (field: ProductField, value: string) => {
    const next = { ...values, [field]: value };
    if (field === "name" && slugLinked) next.slug = slugify(value);
    setValues(next);
    // Re-validate live once a field has been visited, so errors clear as the admin types.
    if (touched[field] || errors[field] || (field === "name" && slugLinked && errors.slug)) {
      const found = validateProductValues(next);
      const linkedSlug = field === "name" && slugLinked;
      setErrors(current => ({ ...current, [field]: found[field], ...(linkedSlug && { slug: found.slug }) }));
    }
    if (field === "slug") setSlugLinked(false);
    setFormError(null);
  };

  const blur = (field: ProductField) => {
    setTouched(current => ({ ...current, [field]: true }));
    const fieldError = validateProductValues(values)[field];
    setErrors(current => ({ ...current, [field]: fieldError }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const found = validateProductValues(values);
    setErrors(found);
    setTouched({ name: true, slug: true, description: true });
    if (Object.keys(found).length) {
      setFormError("Please fix the highlighted fields.");
      return;
    }

    startTransition(async () => {
      try {
        const result = product
          ? await updateProductAction(product.id, values, original)
          : await createProductAction(values);

        if (result.ok) {
          toast.success({
            title: product ? "Product updated" : "Product created",
            description: `${result.product.name} · /${result.product.slug}`,
          });
          onSaved(result.product);
        } else {
          setFormError(result.error);
          if (result.fieldErrors) setErrors(result.fieldErrors);
        }
      } catch {
        setFormError("Something went wrong. Check your connection and try again.");
      }
    });
  };

  const fieldProps = (field: ProductField) => ({
    id: `product-${field}`,
    name: field,
    value: values[field],
    disabled: pending,
    "aria-invalid": Boolean(errors[field]),
    "aria-describedby": `product-${field}-hint`,
    onBlur: () => blur(field),
  });

  return (
    <form onSubmit={submit} noValidate className={ui.formStack}>
      {formError && (
        <div className={ui.inlineError} role="alert">
          <AlertIcon size={16} />
          <span>{formError}</span>
        </div>
      )}

      <div className={ui.field}>
        <label htmlFor="product-name" className={ui.fieldLabel}>
          Product name <span aria-hidden="true">*</span>
        </label>
        <input
          {...fieldProps("name")}
          className={ui.textInput}
          placeholder="e.g. AYABOT"
          maxLength={NAME_MAX + 10}
          autoComplete="off"
          autoFocus
          required
          onChange={event => update("name", event.target.value)}
        />
        <FieldHint id="product-name-hint" error={errors.name}>
          The display name admins and users see.
        </FieldHint>
      </div>

      <div className={ui.field}>
        <div className={ui.fieldLabelRow}>
          <label htmlFor="product-slug" className={ui.fieldLabel}>
            Slug <span aria-hidden="true">*</span>
          </label>
          {!slugLinked && !product && (
            <button
              type="button"
              className={ui.textButton}
              onClick={() => {
                const next = { ...values, slug: slugify(values.name) };
                setValues(next);
                setErrors(validateProductValues(next));
                setSlugLinked(true);
              }}
            >
              Generate from name
            </button>
          )}
        </div>
        <div className={ui.prefixInput}>
          <span aria-hidden="true">/</span>
          <input
            {...fieldProps("slug")}
            className={ui.textInput}
            placeholder="ayabot"
            maxLength={SLUG_MAX + 10}
            autoComplete="off"
            spellCheck={false}
            required
            onChange={event => update("slug", event.target.value.toLowerCase())}
          />
        </div>
        <FieldHint id="product-slug-hint" error={errors.slug}>
          Unique identifier. Lowercase letters, numbers and hyphens.
          {product && values.slug !== original.slug && " Changing it may break integrations that use the old slug."}
        </FieldHint>
      </div>

      <div className={ui.field}>
        <div className={ui.fieldLabelRow}>
          <label htmlFor="product-description" className={ui.fieldLabel}>
            Description <span className={ui.optional}>Optional</span>
          </label>
          <span className={ui.counter} data-over={values.description.length > DESCRIPTION_MAX}>
            {values.description.length}/{DESCRIPTION_MAX}
          </span>
        </div>
        <textarea
          {...fieldProps("description")}
          className={ui.textArea}
          rows={4}
          placeholder="What does this product do?"
          onChange={event => update("description", event.target.value)}
        />
        <FieldHint id="product-description-hint" error={errors.description}>
          A short summary shown in the product list.
        </FieldHint>
      </div>

      <div className={ui.formActions}>
        <button type="button" className={ui.secondaryButton} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
        <button type="submit" className={ui.primaryButton} disabled={pending} aria-busy={pending}>
          {pending && <span className={ui.spinner} aria-hidden="true" />}
          {pending ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>
      </div>
    </form>
  );
}

function FieldHint({ id, error, children }: { id: string; error?: string; children: React.ReactNode }) {
  return (
    <p id={id} className={error ? ui.fieldError : ui.fieldHint}>
      {error ?? children}
    </p>
  );
}
