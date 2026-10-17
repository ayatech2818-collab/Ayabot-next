import type { ConnectionStatus } from "../hooks/useGeminiLive";

/** What the conversation is doing right now, as shown across the page. */
export type Phase =
  | "idle"
  | "connecting"
  | "listening"
  | "user-speaking"
  | "aya-speaking"
  | "muted"
  | "ending"
  | "error";

export function getPhase(input: {
  status: ConnectionStatus;
  isSpeaking: boolean;
  isUserSpeaking: boolean;
  isMuted: boolean;
  isEnding: boolean;
}): Phase {
  if (input.status === "error") return "error";
  if (input.status === "connecting") return "connecting";
  if (input.status !== "connected") return "idle";
  if (input.isEnding) return "ending";
  if (input.isSpeaking) return "aya-speaking";
  if (input.isMuted) return "muted";
  if (input.isUserSpeaking) return "user-speaking";
  return "listening";
}

export const PHASE_COPY: Record<Phase, { label: string; hint: string }> = {
  idle: { label: "Ready", hint: "Tap Aya or press Start to talk" },
  connecting: { label: "Connecting…", hint: "Setting up your microphone" },
  listening: { label: "Listening", hint: "Go ahead, ask anything" },
  "user-speaking": { label: "Hearing you", hint: "Aya replies when you pause" },
  "aya-speaking": { label: "Aya is speaking", hint: "Speak any time to interrupt" },
  muted: { label: "Mic muted", hint: "Unmute to keep talking" },
  ending: { label: "Saying goodbye", hint: "Press End again to close now" },
  error: { label: "Not connected", hint: "See the message below" },
};
