export const VOICE_INPUT_SAMPLE_RATE = 16_000;
export const VOICE_OUTPUT_SAMPLE_RATE = 24_000;

export type VoiceAudioMetadata = {
  encoding: "pcm_s16le";
  sampleRate: number;
  channels: number;
};

export type VoiceClientMessage =
  | { type: "auth"; ticket: string }
  | { type: "audio"; data: string }
  | { type: "text"; text: string }
  | { type: "end" };

export type VoiceServerMessage =
  | { type: "connecting" }
  | {
      type: "ready";
      protocolVersion?: number;
      inputAudio?: VoiceAudioMetadata;
      outputAudio?: VoiceAudioMetadata;
    }
  | { type: "audio"; data: string; mimeType?: string }
  | { type: "input_transcription"; text: string }
  | { type: "output_transcription"; text: string }
  | { type: "interrupted" }
  | { type: "turn_complete" }
  | { type: "error"; message: string; code?: string; recoverable?: boolean };

export type VoiceTicketResponse = {
  ticket: string;
  expires_at: string;
  expires_in: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAudioMetadata(value: unknown): value is VoiceAudioMetadata {
  return (
    isRecord(value) &&
    value.encoding === "pcm_s16le" &&
    typeof value.sampleRate === "number" &&
    Number.isFinite(value.sampleRate) &&
    typeof value.channels === "number" &&
    Number.isInteger(value.channels)
  );
}

/** Runtime validation for messages arriving from the voice gateway. */
export function parseVoiceServerMessage(value: unknown): VoiceServerMessage | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;

  switch (value.type) {
    case "connecting":
    case "interrupted":
    case "turn_complete":
      return { type: value.type };
    case "ready":
      if (value.protocolVersion !== undefined && typeof value.protocolVersion !== "number") return null;
      if (value.inputAudio !== undefined && !isAudioMetadata(value.inputAudio)) return null;
      if (value.outputAudio !== undefined && !isAudioMetadata(value.outputAudio)) return null;
      return {
        type: "ready",
        protocolVersion: value.protocolVersion as number | undefined,
        inputAudio: value.inputAudio as VoiceAudioMetadata | undefined,
        outputAudio: value.outputAudio as VoiceAudioMetadata | undefined,
      };
    case "audio":
      if (typeof value.data !== "string" || (value.mimeType !== undefined && typeof value.mimeType !== "string")) {
        return null;
      }
      return { type: "audio", data: value.data, mimeType: value.mimeType as string | undefined };
    case "input_transcription":
    case "output_transcription":
      return typeof value.text === "string" ? { type: value.type, text: value.text } : null;
    case "error":
      if (
        typeof value.message !== "string" ||
        (value.code !== undefined && typeof value.code !== "string") ||
        (value.recoverable !== undefined && typeof value.recoverable !== "boolean")
      ) {
        return null;
      }
      return {
        type: "error",
        message: value.message,
        code: value.code as string | undefined,
        recoverable: value.recoverable as boolean | undefined,
      };
    default:
      return null;
  }
}

export function isVoiceTicketResponse(value: unknown): value is VoiceTicketResponse {
  return (
    isRecord(value) &&
    typeof value.ticket === "string" &&
    value.ticket.length > 0 &&
    typeof value.expires_at === "string" &&
    Number.isFinite(Date.parse(value.expires_at)) &&
    typeof value.expires_in === "number" &&
    Number.isFinite(value.expires_in) &&
    value.expires_in > 0
  );
}
