import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { ApiError } from "./errors";

/** FastAPI-shaped error body, so lib/api/browser.ts reads `detail` the same way for every route. */
export function detailResponse(detail: string, status: number) {
  return NextResponse.json({ detail }, { status });
}

/**
 * Parses a multipart request for the upload route handlers. Rejects oversized bodies from the
 * Content-Length header before buffering, and anything that isn't multipart/form-data.
 */
export async function readMultipartForm(request: NextRequest, maxBytes: number): Promise<FormData | NextResponse> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) {
    return detailResponse("Expected a multipart/form-data upload.", 415);
  }

  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) {
    return detailResponse("Maximum file size is 10 MB.", 413);
  }

  try {
    return await request.formData();
  } catch {
    return detailResponse("The upload couldn't be read. Please choose the file again.", 400);
  }
}

/**
 * Turns an apiRequest failure into the same status the backend sent (400, 404, 409, 413, ...),
 * with its `detail`. Unreachable backend -> 502; anything unexpected -> 500 without internals.
 */
export function backendErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    if (error.kind === "network") return detailResponse(error.message, 502);
    if (error.kind === "config") return detailResponse("The admin console isn't configured to reach the AYABOT server.", 500);
    return detailResponse(error.message, error.status || 500);
  }
  console.error(error);
  return detailResponse("Something went wrong while handling the upload.", 500);
}
