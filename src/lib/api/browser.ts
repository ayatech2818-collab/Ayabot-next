import { ApiError, detailFromBody, kindForStatus } from "./errors";

/**
 * Client Component counterpart of apiRequest (lib/api/server.ts). Calls go through the
 * /api/backend route handler, which attaches the session token server-side. A 401 means the
 * session ended, so the user is sent back to sign in.
 */
export async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const requestHeaders = new Headers(headers);
  if (json !== undefined) requestHeaders.set("Content-Type", "application/json");

  let response: Response;
  try {
    response = await fetch(`/api/backend${path.startsWith("/") ? path : `/${path}`}`, {
      ...rest,
      headers: requestHeaders,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("network", "Unable to reach the server. Check your connection and try again.");
  }

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const kind = response.status === 502 ? "network" : kindForStatus(response.status);
    if (kind === "unauthorized" || kind === "forbidden") {
      const reason = kind === "forbidden" ? "forbidden" : "expired";
      window.location.assign(`/admin/auth/sign-out?reason=${reason}`);
    }
    throw new ApiError(kind, detailFromBody(data) ?? "Request failed. Please try again.", response.status);
  }

  return data as T;
}
