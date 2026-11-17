/**
 * UI-originated conversation turns only. Model instructions and school knowledge are owned by
 * the FastAPI voice gateway and are never sent from the browser.
 */

/** Sent after the gateway reports ready so Ayabot opens the conversation. */
export const GREETING_PROMPT = `(The visitor has just pressed Start. Greet them now in English with one or two short, warm sentences: say hi, introduce yourself as Ayabot, the voice assistant of Ayadi Glocal School, and ask how you can help them today. Do not mention this note.)`;

/** Sent when the visitor presses End so Ayabot says goodbye before the call closes. */
export const FAREWELL_PROMPT = `(The visitor has pressed End to finish the conversation. Say a short, warm goodbye in the same language you have been speaking with them: thank them for their valuable time and invite them to come back any time. One or two sentences only. Do not ask a question and do not mention this note.)`;
