import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { apiRequest } from "../api/server";
import { ApiError } from "../api/errors";
import { createClient } from "../supabase/server";

// Mirrors CurrentAdminResponse in ayabot-backend/app/schemas/auth.py.
export type AdminRole = "super_admin" | "admin";

export type CurrentAdmin = {
  user: { id: string; email: string | null };
  admin: {
    id: string;
    auth_user_id: string;
    display_name: string | null;
    role: AdminRole;
    is_active: boolean;
    created_at: string;
  };
};

export const LOGIN_PATH = "/admin/login";
export const DASHBOARD_PATH = "/admin";
export const SIGN_OUT_PATH = "/admin/auth/sign-out";

/** Why the user was sent back to the login page; shown as a notice there. */
export type SignOutReason = "expired" | "forbidden" | "signed_out";

/** Asks FastAPI whether the token belongs to an active AYABOT admin. Throws ApiError otherwise. */
export function fetchCurrentAdmin(accessToken?: string) {
  return apiRequest<CurrentAdmin>("/auth/me", { accessToken });
}

/**
 * Gate for protected admin pages: returns the verified admin or redirects. Cached per request
 * so a layout and its page share one backend call. Network/server errors are re-thrown for the
 * route's error boundary - the session may be fine, so we don't sign the user out for them.
 */
export const requireAdmin = cache(async (): Promise<CurrentAdmin> => {
  try {
    const current = await fetchCurrentAdmin();
    if (!current.user.email) {
      // /auth/me doesn't return the email yet; take it from the verified Supabase claims.
      const { data } = await (await createClient()).auth.getClaims();
      const email = data?.claims?.email;
      if (typeof email === "string") current.user.email = email;
    }
    return current;
  } catch (error) {
    redirectOnAuthError(error);
    throw error;
  }
});

/**
 * Ends the session when the backend rejects it: 401 (expired/invalid token) or 403 (no longer
 * an active admin). Returns normally for any other error so the caller can handle it.
 * Server Components can't clear cookies, so a Route Handler signs out and redirects.
 */
export function redirectOnAuthError(error: unknown) {
  if (error instanceof ApiError && (error.kind === "unauthorized" || error.kind === "forbidden")) {
    redirect(`${SIGN_OUT_PATH}?reason=${error.kind === "forbidden" ? "forbidden" : "expired"}`);
  }
}

/** Only allow same-origin admin paths as a post-login destination (prevents open redirects). */
export function safeNextPath(next: unknown) {
  if (typeof next !== "string" || (next !== DASHBOARD_PATH && !next.startsWith(`${DASHBOARD_PATH}/`))) {
    return DASHBOARD_PATH;
  }
  if (next.startsWith(LOGIN_PATH) || next.startsWith("/admin/auth")) return DASHBOARD_PATH;
  return next;
}
