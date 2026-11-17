import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { AudioQueue, AudioRecorder, type SpeechFeatures } from '../utils/audioProcessing';
import { FAREWELL_PROMPT, GREETING_PROMPT } from '../constants/prompts';
import {
  VOICE_INPUT_SAMPLE_RATE,
  VOICE_OUTPUT_SAMPLE_RATE,
  isVoiceTicketResponse,
  parseVoiceServerMessage,
  type VoiceClientMessage,
} from '../lib/voice/protocol';

const VOICE_WS_URL = process.env.NEXT_PUBLIC_AYABOT_VOICE_WS_URL || '';
const TICKET_REQUEST_TIMEOUT_MS = 12_000;

const MAX_EVENTS = 80;
const MAX_TRANSCRIPT = 200;
const VOLUME_STORAGE_KEY = 'ayabot-volume';
const SILENT_SPEECH: SpeechFeatures = { level: 0, low: 0, mid: 0, high: 0, centroid: 0 };
// Longest wait for Aya's goodbye before the call closes anyway.
const FAREWELL_TIMEOUT_MS = 10000;
// Pause after the goodbye finishes playing before hanging up.
const FAREWELL_TAIL_MS = 500;

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

export type TranscriptEntry = {
  id: number;
  role: 'user' | 'aya';
  text: string;
  at: number;
  final: boolean;
  interrupted?: boolean;
  /** True when the user turn came from a topic shortcut instead of the mic. */
  typed?: boolean;
};

export type ActivityKind =
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'user-speaking'
  | 'aya-speaking'
  | 'interrupted'
  | 'turn-complete'
  | 'prompt'
  | 'muted'
  | 'unmuted'
  | 'ending'
  | 'disconnected'
  | 'error';

export type ActivityEvent = {
  id: number;
  at: number;
  kind: ActivityKind;
  label: string;
  detail?: string;
};

let nextId = 1;
const makeId = () => nextId++;

function sendVoiceMessage(ws: WebSocket, message: VoiceClientMessage) {
  ws.send(JSON.stringify(message));
}

async function requestVoiceTicket(signal: AbortSignal) {
  const response = await fetch('/api/voice/session', {
    method: 'POST',
    cache: 'no-store',
    signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok || !isVoiceTicketResponse(payload)) {
    const message =
      payload &&
      typeof payload === 'object' &&
      'error' in payload &&
      payload.error &&
      typeof payload.error === 'object' &&
      'message' in payload.error &&
      typeof payload.error.message === 'string'
        ? payload.error.message
        : 'Could not create a voice session. Please try again.';
    throw new Error(message);
  }
  return payload;
}

function readStoredVolume() {
  try {
    const stored = window.localStorage.getItem(VOLUME_STORAGE_KEY);
    const value = stored === null ? NaN : Number(stored);
    return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 1;
  } catch {
    return 1;
  }
}

// Speaker volume lives outside React so it can be read from storage without a hydration mismatch.
const volumeListeners = new Set<() => void>();
let volumeCache: number | null = null;

function getVolumeSnapshot() {
  if (volumeCache === null) volumeCache = readStoredVolume();
  return volumeCache;
}

function subscribeVolume(listener: () => void) {
  volumeListeners.add(listener);
  return () => {
    volumeListeners.delete(listener);
  };
}

function writeVolume(value: number) {
  volumeCache = value;
  try {
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(value));
  } catch {
    // Volume still applies for this visit when storage is blocked.
  }
  volumeListeners.forEach(listener => listener());
}

function describeMicError(error: unknown) {
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was blocked. Allow microphone permission in your browser and try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No microphone was found. Connect a microphone and try again.';
  }
  if (name === 'NotReadableError') {
    return 'The microphone is being used by another app. Close it and try again.';
  }
  return 'Could not start the microphone.';
}

export function useVoiceSession() {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const volume = useSyncExternalStore(subscribeVolume, getVolumeSnapshot, () => 1);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connectedAt, setConnectedAt] = useState<number | null>(null);
  const [replyLatencyMs, setReplyLatencyMs] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioQueueRef = useRef<AudioQueue | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const statusRef = useRef<ConnectionStatus>('idle');
  const manualCloseRef = useRef(false);
  const gatewayReadyRef = useRef(false);
  const pendingPromptRef = useRef<string | null>(null);
  const mutedRef = useRef(false);
  // Reply timing: when the current model turn started, and when the last user input ended.
  const modelTurnActiveRef = useRef(false);
  const lastTurnEndAtRef = useRef(0);
  const promptSentAtRef = useRef(0);
  // Goodbye in progress: whether its audio has started, and the timer that closes the call.
  const endingRef = useRef(false);
  const farewellAudioRef = useRef(false);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackDoneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ticketAbortRef = useRef<AbortController | null>(null);
  const sessionGenerationRef = useRef(0);

  const updateStatus = useCallback((next: ConnectionStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const logEvent = useCallback((kind: ActivityKind, label: string, detail?: string) => {
    setEvents(prev => [...prev, { id: makeId(), at: Date.now(), kind, label, detail }].slice(-MAX_EVENTS));
  }, []);

  const appendTranscript = useCallback((role: TranscriptEntry['role'], text: string) => {
    if (!text) return;
    setTranscript(prev => {
      // Append to the open entry for this speaker; chunks for the two speakers can interleave.
      for (let i = prev.length - 1; i >= 0; i--) {
        const entry = prev[i];
        if (entry.final) break;
        if (entry.role === role) {
          const updated = [...prev];
          updated[i] = { ...entry, text: entry.text + text };
          return updated;
        }
      }
      return [...prev, { id: makeId(), role, text, at: Date.now(), final: false }].slice(-MAX_TRANSCRIPT);
    });
  }, []);

  /** Close open transcript entries (for one speaker, or both) so the next chunk starts a new bubble. */
  const finalizeTranscript = useCallback((role?: TranscriptEntry['role'], interrupted = false) => {
    setTranscript(prev => {
      const isOpen = (entry: TranscriptEntry) => !entry.final && (!role || entry.role === role);
      if (!prev.some(isOpen)) return prev;
      return prev.map(entry => isOpen(entry) ? { ...entry, final: true, interrupted: interrupted || entry.interrupted } : entry);
    });
  }, []);

  const getPlaybackLevel = useCallback(() => {
    return audioQueueRef.current?.updatePlaybackLevel() ?? 0;
  }, []);

  const getSpeechFeatures = useCallback(() => {
    return audioQueueRef.current?.getSpeechFeatures() ?? SILENT_SPEECH;
  }, []);

  const getInputLevel = useCallback(() => {
    return audioRecorderRef.current?.inputLevel ?? 0;
  }, []);

  const teardown = useCallback(() => {
    sessionGenerationRef.current += 1;
    ticketAbortRef.current?.abort();
    ticketAbortRef.current = null;
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    if (playbackDoneTimerRef.current) {
      clearTimeout(playbackDoneTimerRef.current);
      playbackDoneTimerRef.current = null;
    }
    endingRef.current = false;
    farewellAudioRef.current = false;
    setIsEnding(false);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      audioRecorderRef.current = null;
    }
    if (audioQueueRef.current) {
      audioQueueRef.current.close();
      audioQueueRef.current = null;
    }
    gatewayReadyRef.current = false;
    modelTurnActiveRef.current = false;
    mutedRef.current = false;
    setIsMuted(false);
    setIsSpeaking(false);
    setIsUserSpeaking(false);
    setConnectedAt(null);
  }, []);

  const fail = useCallback((message: string, generation?: number) => {
    if (generation !== undefined && generation !== sessionGenerationRef.current) return;
    teardown();
    finalizeTranscript();
    pendingPromptRef.current = null;
    setError(message);
    updateStatus('error');
    logEvent('error', 'Something went wrong', message);
  }, [teardown, finalizeTranscript, updateStatus, logEvent]);

  const disconnect = useCallback(() => {
    const wasActive = statusRef.current === 'connected' || statusRef.current === 'connecting';
    manualCloseRef.current = true;
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      try {
        sendVoiceMessage(ws, { type: 'end' });
      } catch {
        // The socket is already closing; teardown below remains authoritative.
      }
    }
    teardown();
    finalizeTranscript();
    pendingPromptRef.current = null;
    updateStatus('idle');
    if (wasActive) logEvent('disconnected', 'Conversation ended');
  }, [teardown, finalizeTranscript, updateStatus, logEvent]);

  /** Close the call once the goodbye audio already queued has finished playing. */
  const hangUpAfterPlayback = useCallback(() => {
    if (endTimerRef.current) clearTimeout(endTimerRef.current);
    const remaining = audioQueueRef.current?.remainingMs ?? 0;
    endTimerRef.current = setTimeout(disconnect, remaining + FAREWELL_TAIL_MS);
  }, [disconnect]);

  /** Send a text turn. Hidden turns (greeting, goodbye) stay out of the transcript and timeline. */
  const sendPrompt = useCallback((ws: WebSocket, text: string, hidden = false) => {
    sendVoiceMessage(ws, { type: 'text', text });
    if (hidden) return;
    promptSentAtRef.current = Date.now();
    setTranscript(prev => [
      ...prev,
      { id: makeId(), role: 'user' as const, text, at: Date.now(), final: true, typed: true },
    ].slice(-MAX_TRANSCRIPT));
    logEvent('prompt', 'Topic sent to Aya', text);
  }, [logEvent]);

  const connect = useCallback(async (initialPrompt?: string) => {
    if (statusRef.current === 'connected' || statusRef.current === 'connecting') return;

    setError(null);
    setReplyLatencyMs(null);
    pendingPromptRef.current = initialPrompt ?? null;

    if (!VOICE_WS_URL) {
      fail('The voice WebSocket address is not configured.');
      return;
    }

    let parsedVoiceUrl: URL;
    try {
      parsedVoiceUrl = new URL(VOICE_WS_URL);
      if (parsedVoiceUrl.protocol !== 'ws:' && parsedVoiceUrl.protocol !== 'wss:') throw new Error('Invalid protocol');
    } catch {
      fail('The voice WebSocket address is invalid.');
      return;
    }

    manualCloseRef.current = false;
    updateStatus('connecting');
    logEvent('connecting', 'Connecting to Aya');
    const generation = ++sessionGenerationRef.current;

    try {
      audioQueueRef.current = new AudioQueue();
      audioQueueRef.current.setVolume(getVolumeSnapshot());
      await audioQueueRef.current.resume();
      if (generation !== sessionGenerationRef.current) return;

      const recorder = new AudioRecorder();
      audioRecorderRef.current = recorder;
      recorder.setMuted(mutedRef.current);

      recorder.onSilence = () => {
        if (generation !== sessionGenerationRef.current) return;
        setIsUserSpeaking(false);
      };

      recorder.onSpeech = () => {
        if (generation !== sessionGenerationRef.current) return;
        if (playbackDoneTimerRef.current) {
          clearTimeout(playbackDoneTimerRef.current);
          playbackDoneTimerRef.current = null;
        }
        audioQueueRef.current?.stop();
        setIsSpeaking(false);
        setIsUserSpeaking(true);
        logEvent('user-speaking', 'You are speaking');
      };

      recorder.onDeviceEnded = () => {
        fail('The microphone was disconnected. Reconnect it and try again.', generation);
      };

      recorder.onAudioData = (base64Data) => {
        if (generation !== sessionGenerationRef.current || !gatewayReadyRef.current || mutedRef.current) return;
        const activeSocket = wsRef.current;
        if (activeSocket?.readyState === WebSocket.OPEN) {
          sendVoiceMessage(activeSocket, { type: 'audio', data: base64Data });
        }
      };

      // Ask for microphone permission before consuming a one-time backend ticket.
      try {
        await recorder.start();
      } catch (micError) {
        console.warn('Microphone failed to start:', micError);
        fail(describeMicError(micError), generation);
        return;
      }
      if (generation !== sessionGenerationRef.current) return;

      const ticketController = new AbortController();
      ticketAbortRef.current = ticketController;
      const ticketTimer = window.setTimeout(() => ticketController.abort(), TICKET_REQUEST_TIMEOUT_MS);
      let ticket;
      try {
        ticket = await requestVoiceTicket(ticketController.signal);
      } finally {
        window.clearTimeout(ticketTimer);
        if (ticketAbortRef.current === ticketController) ticketAbortRef.current = null;
      }
      if (generation !== sessionGenerationRef.current) return;

      const ws = new WebSocket(parsedVoiceUrl.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        if (generation !== sessionGenerationRef.current || wsRef.current !== ws) return;
        sendVoiceMessage(ws, { type: 'auth', ticket: ticket.ticket });
      };

      ws.onmessage = async (event) => {
        if (generation !== sessionGenerationRef.current || wsRef.current !== ws) return;
        let dataStr = event.data;
        if (dataStr instanceof Blob) {
          dataStr = await dataStr.text();
          if (generation !== sessionGenerationRef.current) return;
        } else if (typeof dataStr !== 'string') {
          console.warn('Received non-string data over WS', event.data);
          return;
        }

        try {
          const response = parseVoiceServerMessage(JSON.parse(dataStr));
          if (!response) {
            fail('The voice service sent an invalid message.', generation);
            return;
          }

          switch (response.type) {
            case 'connecting':
              return;
            case 'ready': {
              if (
                (response.inputAudio &&
                  (response.inputAudio.encoding !== 'pcm_s16le' ||
                    response.inputAudio.sampleRate !== VOICE_INPUT_SAMPLE_RATE ||
                    response.inputAudio.channels !== 1)) ||
                (response.outputAudio &&
                  (response.outputAudio.encoding !== 'pcm_s16le' ||
                    response.outputAudio.sampleRate !== VOICE_OUTPUT_SAMPLE_RATE ||
                    response.outputAudio.channels !== 1))
              ) {
                fail('The voice service reported an unsupported audio format.', generation);
                return;
              }
              if (gatewayReadyRef.current) return;
              gatewayReadyRef.current = true;
              updateStatus('connected');
              setConnectedAt(Date.now());
              lastTurnEndAtRef.current = Date.now();
              logEvent('connected', 'Connected to Aya');
              logEvent('listening', 'Listening for your voice');
              const pending = pendingPromptRef.current;
              pendingPromptRef.current = null;
              if (ws.readyState === WebSocket.OPEN) {
                if (pending) sendPrompt(ws, pending);
                else sendPrompt(ws, GREETING_PROMPT, true);
              }
              return;
            }
            case 'input_transcription':
              appendTranscript('user', response.text);
              return;
            case 'output_transcription':
              appendTranscript('aya', response.text);
              return;
            case 'audio':
              if (!modelTurnActiveRef.current) {
                modelTurnActiveRef.current = true;
                const lastInputAt = Math.max(
                  audioRecorderRef.current?.lastVoiceAt ?? 0,
                  promptSentAtRef.current,
                );
                if (lastInputAt > lastTurnEndAtRef.current) {
                  setReplyLatencyMs(Date.now() - lastInputAt);
                }
                setIsUserSpeaking(false);
                finalizeTranscript('user');
                logEvent('aya-speaking', 'Aya is replying');
              }
              if (playbackDoneTimerRef.current) {
                clearTimeout(playbackDoneTimerRef.current);
                playbackDoneTimerRef.current = null;
              }
              setIsSpeaking(true);
              if (endingRef.current) farewellAudioRef.current = true;
              if (audioRecorderRef.current) {
                audioRecorderRef.current.suppressVAD = true;
              }
              audioQueueRef.current?.playBase64PCM(response.data, VOICE_OUTPUT_SAMPLE_RATE);
              return;
            case 'interrupted':
              if (playbackDoneTimerRef.current) {
                clearTimeout(playbackDoneTimerRef.current);
                playbackDoneTimerRef.current = null;
              }
              audioQueueRef.current?.stop();
              farewellAudioRef.current = false;
              setIsSpeaking(false);
              if (audioRecorderRef.current) audioRecorderRef.current.suppressVAD = false;
              if (modelTurnActiveRef.current) {
                modelTurnActiveRef.current = false;
                lastTurnEndAtRef.current = Date.now();
                finalizeTranscript('aya', true);
                logEvent('interrupted', 'You interrupted Aya');
              }
              return;
            case 'turn_complete': {
              modelTurnActiveRef.current = false;
              lastTurnEndAtRef.current = Date.now();
              finalizeTranscript();
              logEvent('turn-complete', 'Aya finished replying');
              if (endingRef.current && farewellAudioRef.current) hangUpAfterPlayback();
              if (playbackDoneTimerRef.current) clearTimeout(playbackDoneTimerRef.current);
              const playbackRemaining = audioQueueRef.current?.remainingMs ?? 0;
              playbackDoneTimerRef.current = setTimeout(() => {
                if (generation !== sessionGenerationRef.current) return;
                playbackDoneTimerRef.current = null;
                setIsSpeaking(false);
                if (audioRecorderRef.current) {
                  audioRecorderRef.current.suppressVAD = false;
                }
              }, playbackRemaining + 300);
              return;
            }
            case 'error':
              fail(response.message || 'The voice service encountered an error.', generation);
              return;
          }
        } catch (err) {
          console.error("Failed to parse socket message", err);
          fail('The voice service sent an invalid message.', generation);
        }
      };

      ws.onclose = (closeEvent) => {
        if (manualCloseRef.current || generation !== sessionGenerationRef.current || wsRef.current !== ws) return;
        const reason = closeEvent.reason ? `: ${closeEvent.reason}` : '';
        const message = closeEvent.code === 1008
          ? 'The voice session could not be authenticated. Please start a new session.'
          : `The voice connection closed unexpectedly (code ${closeEvent.code}${reason}).`;
        fail(message, generation);
      };

      ws.onerror = (wsError) => {
        if (generation !== sessionGenerationRef.current) return;
        console.error('WebSocket Error:', wsError);
      };

    } catch (e: unknown) {
      if (generation !== sessionGenerationRef.current) return;
      console.error('Failed to start:', e);
      const message = e instanceof Error && e.message
        ? e.message
        : 'Could not start the conversation. Check your connection and try again.';
      fail(message, generation);
    }
  }, [fail, updateStatus, logEvent, appendTranscript, finalizeTranscript, sendPrompt, hangUpAfterPlayback]);

  /**
   * End the conversation with a spoken goodbye. Pressing again while Aya says goodbye, or ending
   * before the session is ready, closes the call right away.
   */
  const endConversation = useCallback(() => {
    const ws = wsRef.current;
    if (
      endingRef.current ||
      statusRef.current !== 'connected' ||
      !gatewayReadyRef.current ||
      !ws ||
      ws.readyState !== WebSocket.OPEN
    ) {
      disconnect();
      return;
    }
    endingRef.current = true;
    farewellAudioRef.current = false;
    setIsEnding(true);
    pendingPromptRef.current = null;
    // Stop listening so the visitor or the room can't cut the goodbye short.
    audioRecorderRef.current?.setMuted(true);
    setIsUserSpeaking(false);
    audioQueueRef.current?.stop();
    logEvent('ending', 'Aya is saying goodbye');
    sendPrompt(ws, FAREWELL_PROMPT, true);
    // Close anyway if the goodbye never arrives.
    endTimerRef.current = setTimeout(hangUpAfterPlayback, FAREWELL_TIMEOUT_MS);
  }, [disconnect, logEvent, sendPrompt, hangUpAfterPlayback]);

  /** Ask Aya something by text. Starts a conversation first when needed. */
  const askTopic = useCallback((text: string) => {
    if (endingRef.current) return;
    const ws = wsRef.current;
    if (statusRef.current === 'connected' && gatewayReadyRef.current && ws?.readyState === WebSocket.OPEN) {
      // Stop any reply in progress so the new topic is answered right away.
      audioQueueRef.current?.stop();
      sendPrompt(ws, text);
      return;
    }
    if (statusRef.current === 'connecting' || statusRef.current === 'connected') {
      pendingPromptRef.current = text;
      return;
    }
    void connect(text);
  }, [connect, sendPrompt]);

  const toggleMute = useCallback(() => {
    if (endingRef.current) return;
    const next = !mutedRef.current;
    mutedRef.current = next;
    setIsMuted(next);
    audioRecorderRef.current?.setMuted(next);
    if (next) setIsUserSpeaking(false);
    logEvent(next ? 'muted' : 'unmuted', next ? 'Microphone muted' : 'Microphone on');
  }, [logEvent]);

  const setVolume = useCallback((value: number) => {
    const clamped = Math.min(1, Math.max(0, value));
    audioQueueRef.current?.setVolume(clamped);
    writeVolume(clamped);
  }, []);

  /** End the conversation and clear the transcript and timeline. */
  const resetSession = useCallback(() => {
    disconnect();
    setTranscript([]);
    setEvents([]);
    setReplyLatencyMs(null);
    setError(null);
    updateStatus('idle');
  }, [disconnect, updateStatus]);

  const dismissError = useCallback(() => {
    setError(null);
    if (statusRef.current === 'error') updateStatus('idle');
  }, [updateStatus]);

  useEffect(() => () => {
    manualCloseRef.current = true;
    teardown();
  }, [teardown]);

  return {
    status,
    error,
    isSpeaking,
    isUserSpeaking,
    isMuted,
    isEnding,
    volume,
    transcript,
    events,
    connectedAt,
    replyLatencyMs,
    getPlaybackLevel,
    getSpeechFeatures,
    getInputLevel,
    connect,
    disconnect,
    endConversation,
    askTopic,
    toggleMute,
    setVolume,
    resetSession,
    dismissError,
  };
}
