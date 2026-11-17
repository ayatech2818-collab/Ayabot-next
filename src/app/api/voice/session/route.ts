import "server-only";

import { isVoiceTicketResponse } from "@/lib/voice/protocol";

const TICKET_REQUEST_TIMEOUT_MS = 10_000;

function errorResponse(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST() {
  const backendOrigin = process.env.AYABOT_API_URL?.trim();
  const productApiKey = process.env.AYABOT_PRODUCT_API_KEY?.trim();

  if (!backendOrigin || !productApiKey) {
    return errorResponse(503, "voice_not_configured", "Voice service is not configured.");
  }

  let endpoint: URL;
  try {
    endpoint = new URL("/api/v1/voice/session", `${backendOrigin.replace(/\/+$/, "")}/`);
  } catch {
    return errorResponse(503, "voice_not_configured", "Voice service is not configured.");
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-API-Key": productApiKey,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(TICKET_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const status = response.status === 503 ? 503 : 502;
      const code = response.status === 503 ? "voice_unavailable" : "ticket_request_failed";
      return errorResponse(status, code, "Voice service is unavailable. Please try again.");
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!isVoiceTicketResponse(payload)) {
      return errorResponse(502, "invalid_ticket_response", "Voice service returned an invalid response.");
    }

    return Response.json(
      {
        ticket: payload.ticket,
        expires_at: payload.expires_at,
        expires_in: payload.expires_in,
      },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    return errorResponse(
      502,
      timedOut ? "ticket_request_timeout" : "ticket_request_failed",
      timedOut
        ? "Voice service took too long to respond. Please try again."
        : "Unable to reach the voice service. Please try again.",
    );
  }
}
