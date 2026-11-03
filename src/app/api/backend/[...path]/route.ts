import { NextResponse, type NextRequest } from "next/server";
import { apiUrl, getAccessToken } from "../../../../lib/api/server";

/**
 * Backend-for-frontend passthrough: browser code calls /api/backend/<path> and this forwards to
 * FastAPI /api/v1/<path> with the session's Bearer token, so tokens never reach client JS and
 * the backend needs no CORS. Use lib/api/browser.ts rather than calling this directly.
 */
async function forward(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json({ detail: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const { path } = await params;
  const target = `${apiUrl(path.map(encodeURIComponent).join("/"))}${request.nextUrl.search}`;

  const headers = new Headers({ Authorization: `Bearer ${token}`, Accept: "application/json" });
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });

    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
    return new NextResponse(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return NextResponse.json({ detail: "Unable to reach the AYABOT server." }, { status: 502 });
  }
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };
