import type { Metadata } from "next";
import { listAllProducts } from "../../../../lib/api/products";
import { redirectOnAuthError } from "../../../../lib/auth/admin";
import ProductsManager from "./_components/ProductsManager";

export const metadata: Metadata = { title: "Products" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const { new: startWithCreate } = await searchParams;

  let products;
  try {
    // Active and inactive together; the client filters by status without another round trip.
    products = await listAllProducts({ includeInactive: true });
  } catch (error) {
    redirectOnAuthError(error);
    throw error; // network/server errors -> products/error.tsx
  }

  return <ProductsManager products={products} startWithCreate={startWithCreate === "1"} />;
}
