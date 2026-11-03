"use server";

import { revalidatePath } from "next/cache";
import {
  createProduct,
  deactivateProduct,
  restoreProduct,
  updateProduct,
  type Product,
  type ProductUpdateInput,
} from "../../../../lib/api/products";
import {
  normalizeProductValues,
  validateProductValues,
  type ProductFieldErrors,
  type ProductFormValues,
} from "../../../../lib/products/validation";
import { UUID_PATTERN, toActionFailure } from "./actionErrors";

export type ProductActionResult =
  | { ok: true; product: Product }
  | { ok: false; error: string; fieldErrors?: ProductFieldErrors };

const PRODUCTS_PATH = "/admin/products";

/** The backend uses 409 for both a taken slug and an already-(in)active product. */
function failure(error: unknown): ProductActionResult {
  return toActionFailure<keyof ProductFieldErrors>(error, {
    notFound: "This product no longer exists. It may have been removed.",
    conflictField: message =>
      /slug/i.test(message)
        ? {
            field: "slug",
            error: "That slug is already used by another product.",
            fieldError: "This slug is already taken. Choose a different one.",
          }
        : null,
  });
}

function checkId(productId: string): ProductActionResult | null {
  return UUID_PATTERN.test(productId) ? null : { ok: false, error: "Invalid product reference." };
}

function refresh(productId?: string) {
  revalidatePath(PRODUCTS_PATH);
  if (productId) revalidatePath(`${PRODUCTS_PATH}/${productId}`);
  revalidatePath("/admin");
}

export async function createProductAction(values: ProductFormValues): Promise<ProductActionResult> {
  const fieldErrors = validateProductValues(values);
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };

  const { name, slug, description } = normalizeProductValues(values);
  try {
    const product = await createProduct({ name, slug, description: description || null });
    refresh();
    return { ok: true, product };
  } catch (error) {
    return failure(error);
  }
}

/** PATCH semantics: only fields that differ from `original` are sent. */
export async function updateProductAction(
  productId: string,
  values: ProductFormValues,
  original: ProductFormValues,
): Promise<ProductActionResult> {
  const invalid = checkId(productId);
  if (invalid) return invalid;

  const fieldErrors = validateProductValues(values);
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };

  const next = normalizeProductValues(values);
  const prev = normalizeProductValues(original);
  const changes: ProductUpdateInput = {};
  if (next.name !== prev.name) changes.name = next.name;
  if (next.slug !== prev.slug) changes.slug = next.slug;
  if (next.description !== prev.description) changes.description = next.description || null;

  if (!Object.keys(changes).length) return { ok: false, error: "No changes to save." };

  try {
    const product = await updateProduct(productId, changes);
    refresh(productId);
    return { ok: true, product };
  } catch (error) {
    return failure(error);
  }
}

export async function deactivateProductAction(productId: string): Promise<ProductActionResult> {
  const invalid = checkId(productId);
  if (invalid) return invalid;
  try {
    const product = await deactivateProduct(productId);
    refresh(productId);
    return { ok: true, product };
  } catch (error) {
    return failure(error);
  }
}

export async function restoreProductAction(productId: string): Promise<ProductActionResult> {
  const invalid = checkId(productId);
  if (invalid) return invalid;
  try {
    const product = await restoreProduct(productId);
    refresh(productId);
    return { ok: true, product };
  } catch (error) {
    return failure(error);
  }
}
