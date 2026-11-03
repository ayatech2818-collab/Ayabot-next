// Shared by server and browser code, so keep this free of server-only imports.

export type ApiErrorKind =
  | "unauthorized" // 401: missing, invalid or expired access token
  | "forbidden" // 403: valid user without an active AYABOT admin record
  | "not_found"
  | "validation"
  | "server"
  | "network" // backend unreachable or timed out
  | "config";

export class ApiError extends Error {
  readonly status: number;
  readonly kind: ApiErrorKind;

  constructor(kind: ApiErrorKind, message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

export function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 422) return "validation";
  return "server";
}

/** Pulls FastAPI's `detail` (a string, or a list of validation errors) out of an error body. */
export function detailFromBody(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body)) return null;
  const { detail } = body as { detail: unknown };
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map(item => (item && typeof item === "object" && "msg" in item ? String(item.msg) : null))
      .filter(Boolean);
    return messages.length ? messages.join("; ") : null;
  }
  return null;
}
