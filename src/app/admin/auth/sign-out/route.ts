import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { LOGIN_PATH, type SignOutReason } from "../../../../lib/auth/admin";

const REASONS: SignOutReason[] = ["expired", "forbidden", "signed_out"];

/**
 * Clears the Supabase session and returns to the login page. Server Components redirect here
 * when the backend rejects the session, because only Route Handlers/Actions can write cookies.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });

  const reason = request.nextUrl.searchParams.get("reason") as SignOutReason | null;
  const loginUrl = new URL(LOGIN_PATH, request.url);
  if (reason && REASONS.includes(reason)) loginUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(loginUrl);
}
