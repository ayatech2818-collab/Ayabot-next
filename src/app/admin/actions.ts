"use server";

import { redirect } from "next/navigation";
import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { createClient } from "../../lib/supabase/server";
import { ApiError } from "../../lib/api/errors";
import { LOGIN_PATH, fetchCurrentAdmin, safeNextPath } from "../../lib/auth/admin";

export type LoginState = {
  error?: string;
  email?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authErrorMessage(error: unknown) {
  if (isAuthRetryableFetchError(error)) {
    return "Unable to reach the sign-in service. Check your connection and try again.";
  }
  if (isAuthApiError(error)) {
    if (error.code === "invalid_credentials") return "Incorrect email or password.";
    if (error.code === "email_not_confirmed") return "This email address hasn't been confirmed yet.";
    if (error.code === "user_banned") return "This account has been disabled.";
    if (error.status === 429) return "Too many sign-in attempts. Please wait a moment and try again.";
  }
  return "Sign-in failed. Please try again.";
}

function adminErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.kind === "forbidden") {
      return "This account doesn't have access to AYABOT administration. If you think it should, ask a super admin to check that your admin record exists and is active.";
    }
    if (error.kind === "unauthorized") return "Your session couldn't be verified. Please sign in again.";
    if (error.kind === "network") return error.message;
  }
  return "The AYABOT server couldn't verify your account. Please try again shortly.";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!EMAIL_PATTERN.test(email)) return { error: "Enter a valid email address.", email };
  if (!password) return { error: "Enter your password.", email };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return { error: authErrorMessage(error), email };

  // A Supabase account alone isn't enough: the backend must find an active ayabot_admins row.
  try {
    await fetchCurrentAdmin(data.session.access_token);
  } catch (adminError) {
    await supabase.auth.signOut();
    return { error: adminErrorMessage(adminError), email };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(`${LOGIN_PATH}?reason=signed_out`);
}
