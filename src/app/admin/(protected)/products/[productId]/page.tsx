import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArrowLeftIcon } from "../../../../../components/icons";
import { listCredentials, type Credential } from "../../../../../lib/api/credentials";
import { ApiError } from "../../../../../lib/api/errors";
import { getProduct } from "../../../../../lib/api/products";
import { redirectOnAuthError } from "../../../../../lib/auth/admin";
import { UUID_PATTERN } from "../actionErrors";
import ProductDetail from "../_components/ProductDetail";
import CredentialsSection from "../_components/credentials/CredentialsSection";
import styles from "../products.module.css";

type Params = Promise<{ productId: string }>;

// Shared by generateMetadata and the page, so the product is fetched once per request.
const loadProduct = cache(async (productId: string) => {
  if (!UUID_PATTERN.test(productId)) notFound();
  try {
    return await getProduct(productId);
  } catch (error) {
    redirectOnAuthError(error);
    if (error instanceof ApiError && error.kind === "not_found") notFound();
    throw error;
  }
});

/**
 * Active and revoked keys (metadata only). A failure here is shown inside the credentials
 * section rather than replacing the whole page, since the product itself loaded fine.
 */
async function loadCredentials(productId: string): Promise<{ credentials: Credential[] | null; error?: string }> {
  try {
    return { credentials: await listCredentials(productId, { includeInactive: true }) };
  } catch (error) {
    redirectOnAuthError(error);
    if (error instanceof ApiError && error.kind === "network") return { credentials: null, error: error.message };
    return { credentials: null };
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const product = await loadProduct((await params).productId);
  return { title: product.name };
}

export default async function ProductDetailPage({ params }: { params: Params }) {
  const { productId } = await params;
  // In parallel; if the product 404s, loadProduct's notFound() wins.
  const [product, { credentials, error }] = await Promise.all([loadProduct(productId), loadCredentials(productId)]);

  return (
    <>
      <Link href="/admin/products" className={styles.backLink}>
        <ArrowLeftIcon size={16} />
        All products
      </Link>
      <ProductDetail product={product} />
      <CredentialsSection
        productId={product.id}
        productName={product.name}
        productActive={product.is_active}
        credentials={credentials}
        loadError={error}
      />
    </>
  );
}
