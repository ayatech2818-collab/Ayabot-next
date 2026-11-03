import "server-only";

import { apiRequest } from "./server";

// Mirrors ProductResponse / ProductCreate / ProductUpdate in ayabot-backend/app/schemas/product.py.
export type Product = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProductCreateInput = {
  name: string;
  slug: string;
  description?: string | null;
};

export type ProductUpdateInput = Partial<ProductCreateInput>;

export type ListProductsOptions = {
  includeInactive?: boolean;
  skip?: number;
  /** 1-100; the backend rejects anything larger. */
  limit?: number;
};

/** The backend's maximum page size for GET /products. */
export const PRODUCT_PAGE_LIMIT = 100;

const productPath = (productId: string) => `/products/${encodeURIComponent(productId)}`;

export function listProducts({ includeInactive = false, skip = 0, limit = PRODUCT_PAGE_LIMIT }: ListProductsOptions = {}) {
  const query = new URLSearchParams({
    include_inactive: String(includeInactive),
    skip: String(skip),
    limit: String(Math.min(Math.max(limit, 1), PRODUCT_PAGE_LIMIT)),
  });
  return apiRequest<Product[]>(`/products?${query}`);
}

/**
 * Every product, following pages of PRODUCT_PAGE_LIMIT until a short page comes back.
 * `maxPages` caps the walk so a runaway table can't stall the page render.
 */
export async function listAllProducts({ includeInactive = false, maxPages = 10 } = {}) {
  const products: Product[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await listProducts({ includeInactive, skip: page * PRODUCT_PAGE_LIMIT });
    products.push(...batch);
    if (batch.length < PRODUCT_PAGE_LIMIT) break;
  }
  return products;
}

export function getProduct(productId: string) {
  return apiRequest<Product>(productPath(productId));
}

export function createProduct(input: ProductCreateInput) {
  return apiRequest<Product>("/products", { method: "POST", json: input });
}

export function updateProduct(productId: string, input: ProductUpdateInput) {
  return apiRequest<Product>(productPath(productId), { method: "PATCH", json: input });
}

/** Soft delete: DELETE marks the product inactive and returns it. */
export function deactivateProduct(productId: string) {
  return apiRequest<Product>(productPath(productId), { method: "DELETE" });
}

export function restoreProduct(productId: string) {
  return apiRequest<Product>(`${productPath(productId)}/restore`, { method: "PATCH" });
}
