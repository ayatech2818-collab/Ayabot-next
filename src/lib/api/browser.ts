import { ApiError, detailFromBody, kindForStatus } from "./errors";

/**
 * Error for a failed same-origin call. A 401/403 means the session ended (or admin access was
 * removed), so the user is sent back to sign in.
 */
function responseError(status: number, data: unknown) {
  const kind = status === 502 ? "network" : kindForStatus(status);
  if (kind === "unauthorized" || kind === "forbidden") {
    const reason = kind === "forbidden" ? "forbidden" : "expired";
    window.location.assign(`/admin/auth/sign-out?reason=${reason}`);
  }
  return new ApiError(kind, detailFromBody(data) ?? "Request failed. Please try again.", status);
}

/**
 * Client Component counterpart of apiRequest (lib/api/server.ts). Calls go through the
 * /api/backend route handler, which attaches the session token server-side.
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
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError("network", "Unable to reach the server. Check your connection and try again.");
  }

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw responseError(response.status, data);
  return data as T;
}

export type UploadOptions = {
  method?: "POST" | "PUT";
  /** Called with 0-1 as the request body is sent to the Next.js server. */
  onProgress?: (fraction: number) => void;
};

/**
 * Sends multipart/form-data to one of this app's upload route handlers (e.g. /api/knowledge/*),
 * which attach the session token server-side. Uses XHR because fetch() can't report upload
 * progress. Errors and session expiry are handled the same way as apiFetch.
 */
export function apiUpload<T>(url: string, body: FormData, { method = "POST", onProgress }: UploadOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Accept", "application/json");

    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else reject(responseError(xhr.status, data));
    };
    xhr.onerror = () => reject(new ApiError("network", "Unable to reach the server. Check your connection and try again."));
    xhr.onabort = () => reject(new ApiError("network", "The upload was interrupted. Please try again."));

    xhr.send(body);
  });
}
