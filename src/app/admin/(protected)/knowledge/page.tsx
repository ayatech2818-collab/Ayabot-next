import type { Metadata } from "next";
import Link from "next/link";
import { BookIcon, PlusIcon } from "../../../../components/icons";
import { ApiError } from "../../../../lib/api/errors";
import { listKnowledgeDocuments, type KnowledgeDocument } from "../../../../lib/api/knowledge";
import { listAllProducts, type Product } from "../../../../lib/api/products";
import { redirectOnAuthError } from "../../../../lib/auth/admin";
import KnowledgeManager, { type KnowledgeProduct } from "./_components/KnowledgeManager";
import productStyles from "../products/products.module.css";
import ui from "../../_components/ui.module.css";

export const metadata: Metadata = { title: "Knowledge Base" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * The first page of documents is rendered on the server; after that KnowledgeManager keeps the
 * list in client state so it can poll while documents are processing. A failure here is shown
 * inside the list card (the products loaded fine), with a retry.
 */
async function loadDocuments(productId: string): Promise<{ documents: KnowledgeDocument[] | null; error?: string }> {
  try {
    return { documents: await listKnowledgeDocuments(productId) };
  } catch (error) {
    redirectOnAuthError(error);
    if (error instanceof ApiError) {
      return { documents: null, error: error.kind === "network" ? error.message : "The AYABOT server couldn't load this product's documents." };
    }
    throw error;
  }
}

export default async function KnowledgePage({ searchParams }: { searchParams: SearchParams }) {
  const { product: requested } = await searchParams;

  let products: Product[];
  try {
    products = await listAllProducts({ includeInactive: true });
  } catch (error) {
    redirectOnAuthError(error);
    throw error; // network/server errors -> knowledge/error.tsx
  }

  // Uploads need an active product, so active products are listed (and preselected) first.
  const ordered: KnowledgeProduct[] = [...products.filter(p => p.is_active), ...products.filter(p => !p.is_active)].map(
    ({ id, name, slug, is_active }) => ({ id, name, slug, is_active }),
  );
  const selected = ordered.find(product => product.id === requested) ?? ordered[0];

  if (!selected) {
    return (
      <>
        <section className={productStyles.header}>
          <div>
            <p className={ui.eyebrow}>Retrieval</p>
            <h1 className={productStyles.title}>Knowledge Base</h1>
            <p className={productStyles.subtitle}>Manage product-specific documents used by AYABOT for knowledge retrieval.</p>
          </div>
        </section>
        <section className={productStyles.card}>
          <div className={productStyles.empty}>
            <span className={productStyles.emptyIcon} aria-hidden="true">
              <BookIcon size={26} strokeWidth={1.6} />
            </span>
            <h3>Create a product first</h3>
            <p>Knowledge documents belong to a product. Add a product, then upload the documents AYABOT should learn from.</p>
            <Link href="/admin/products?new=1" className={ui.primaryButton}>
              <PlusIcon size={17} strokeWidth={2.4} />
              Create product
            </Link>
          </div>
        </section>
      </>
    );
  }

  const { documents, error } = await loadDocuments(selected.id);

  // Keyed by product so switching products starts from fresh client state.
  return (
    <KnowledgeManager key={selected.id} products={ordered} productId={selected.id} initialDocuments={documents} loadError={error} />
  );
}
