"use server";

import { revalidatePath } from "next/cache";
import { createCredential, revokeCredential, type CreatedCredential, type Credential } from "../../../../lib/api/credentials";
import { CREDENTIAL_NAME_MAX, CREDENTIAL_NAME_MIN, type CredentialFieldErrors } from "../../../../lib/products/credentialValidation";
import { UUID_PATTERN, toActionFailure, type ActionFailure } from "./actionErrors";

export type CreateCredentialResult = { ok: true; credential: CreatedCredential } | ActionFailure<keyof CredentialFieldErrors>;
export type RevokeCredentialResult = { ok: true; credential: Credential } | ActionFailure;

const productPath = (productId: string) => `/admin/products/${productId}`;

function invalidIds(...ids: string[]) {
  return ids.every(id => UUID_PATTERN.test(id)) ? null : ({ ok: false, error: "Invalid product or credential reference." } as const);
}

/**
 * Asks the backend to generate a key. The raw `api_key` is returned to the caller exactly once,
 * in this response; it is never logged, cached or stored here.
 */
export async function createCredentialAction(
  productId: string,
  input: { name: string; expiresAt: string | null },
): Promise<CreateCredentialResult> {
  const invalid = invalidIds(productId);
  if (invalid) return invalid;

  const name = input.name.trim();
  if (name.length < CREDENTIAL_NAME_MIN || name.length > CREDENTIAL_NAME_MAX) {
    const message = `Name must be ${CREDENTIAL_NAME_MIN}-${CREDENTIAL_NAME_MAX} characters.`;
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { name: message } };
  }

  let expiresAt: string | null = null;
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt);
    if (Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
      return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: { customDate: "The expiration date must be in the future." } };
    }
    expiresAt = parsed.toISOString();
  }

  try {
    const credential = await createCredential(productId, { name, expires_at: expiresAt });
    revalidatePath(productPath(productId));
    revalidatePath("/admin");
    return { ok: true, credential };
  } catch (error) {
    // 409 here means the product is inactive.
    return toActionFailure(error, { notFound: "This product no longer exists. It may have been removed." });
  }
}

export async function revokeCredentialAction(productId: string, credentialId: string): Promise<RevokeCredentialResult> {
  const invalid = invalidIds(productId, credentialId);
  if (invalid) return invalid;

  try {
    const credential = await revokeCredential(productId, credentialId);
    revalidatePath(productPath(productId));
    revalidatePath("/admin");
    return { ok: true, credential };
  } catch (error) {
    // 409 here means the credential was already revoked (e.g. in another tab).
    revalidatePath(productPath(productId));
    revalidatePath("/admin");
    return toActionFailure(error, { notFound: "This credential no longer exists." });
  }
}
