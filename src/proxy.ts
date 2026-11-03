import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "./lib/supabase/proxy";

const LOGIN_PATH = "/admin/login";
const PUBLIC_ADMIN_PATHS = [LOGIN_PATH, "/admin/auth/"];

/**
 * Optimistic gate for the admin area: refreshes the Supabase session cookies and bounces
 * requests without a valid session. The authoritative admin check (FastAPI /auth/me) runs in
 * the protected layout, since Proxy should stay fast and not call the backend on every request.
 */
export async function proxy(request: NextRequest) {
  const { response, isAuthenticated } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  if (isAuthenticated || PUBLIC_ADMIN_PATHS.some(path => pathname.startsWith(path))) {
    return response;
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ detail: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const loginUrl = new URL(LOGIN_PATH, request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  // Auth cookies that no longer validate mean the session expired (vs. never signed in).
  if (request.cookies.getAll().some(({ name }) => name.startsWith("sb-") && name.includes("auth-token"))) {
    loginUrl.searchParams.set("reason", "expired");
  }

  const redirect = NextResponse.redirect(loginUrl);
  // Carry over any cookie changes (e.g. cleared stale tokens) made while checking the session.
  response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: ["/admin/:path*", "/api/backend/:path*"],
};
