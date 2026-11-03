import "server-only";

import { createClient } from "../supabase/server";
import { ApiError, detailFromBody, kindForStatus } from "./errors";

const API_PREFIX = "/api/v1";
const DEFAULT_TIMEOUT_MS = 10_000;

export type ApiRequestOptions = Omit<RequestInit, "body"> & {
  /** JSON-serialisable body; sent with Content-Type: application/json. */
  json?: unknown;
  body?: BodyInit;
  /** Use this token instead of reading it from the Supabase session cookies. */
  accessToken?: string;
  timeoutMs?: number;
};

function apiBaseUrl() {
  const base = process.env.AYABOT_API_URL;
  if (!base) throw new ApiError("config", "AYABOT_API_URL is not configured.");
  return base.replace(/\/+$/, "");
}

/** Builds the absolute backend URL for a path relative to /api/v1 (e.g. "/auth/me"). */
export function apiUrl(path: string) {
  return `${apiBaseUrl()}${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`;
}

/** The current user's Supabase access token, or null when there is no session. */
export async function getAccessToken() {
  const supabase = await createClient();
  // proxy.ts has already verified and refreshed this session; the backend re-verifies the JWT.
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/**
 * The one place that talks to the AYABOT FastAPI backend. Attaches the Supabase access token
 * as a Bearer header and turns every failure into an ApiError with a `kind` callers can branch on.
 * Server-only: the backend has no CORS and tokens stay off the client. Browser code goes
 * through the /api/backend/* route handler, which uses this function.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { json, accessToken, timeoutMs = DEFAULT_TIMEOUT_MS, headers, body, ...init } = options;

  const token = accessToken ?? (await getAccessToken());
  if (!token) throw new ApiError("unauthorized", "Your session has expired. Please sign in again.", 401);

  const requestHeaders = new Headers(headers);
  requestHeaders.set("Authorization", `Bearer ${token}`);
  requestHeaders.set("Accept", "application/json");
  if (json !== undefined) requestHeaders.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers: requestHeaders,
      body: json !== undefined ? JSON.stringify(json) : body,
      cache: "no-store",
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError("network", "Unable to reach the AYABOT server. Check your connection and try again.");
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const kind = kindForStatus(response.status);
    const fallback =
      kind === "server" ? "The AYABOT server ran into a problem. Please try again." : response.statusText;
    throw new ApiError(kind, detailFromBody(data) ?? fallback, response.status);
  }

  return data as T;
}
