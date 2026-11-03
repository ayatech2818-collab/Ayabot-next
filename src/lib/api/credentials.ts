import "server-only";

import { apiRequest } from "./server";

// Mirrors CredentialResponse / CredentialCreatedResponse / CredentialCreate in
// ayabot-backend/app/schemas/product_credential.py.
export type Credential = {
  id: string;
  product_id: string;
  name: string;
  /** First 12 characters of the key (e.g. "ayb_AbCdEfGh"), safe to display. */
  key_prefix: string;
  /** False once revoked. An expired key stays active; compare `expires_at` to know. */
  is_active: boolean;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

/** Only returned by POST, once. The raw key is never retrievable again. */
export type CreatedCredential = Credential & { api_key: string };

export type CredentialCreateInput = {
  name: string;
  /** ISO 8601 timestamp, or null for a key that never expires. */
  expires_at: string | null;
};

const credentialsPath = (productId: string) => `/products/${encodeURIComponent(productId)}/credentials`;

export function listCredentials(productId: string, { includeInactive = false } = {}) {
  const query = new URLSearchParams({ include_inactive: String(includeInactive) });
  return apiRequest<Credential[]>(`${credentialsPath(productId)}?${query}`);
}

export function createCredential(productId: string, input: CredentialCreateInput) {
  return apiRequest<CreatedCredential>(credentialsPath(productId), { method: "POST", json: input });
}

/** Revoking is permanent: the backend has no un-revoke endpoint. */
export function revokeCredential(productId: string, credentialId: string) {
  return apiRequest<Credential>(`${credentialsPath(productId)}/${encodeURIComponent(credentialId)}`, {
    method: "DELETE",
  });
}
