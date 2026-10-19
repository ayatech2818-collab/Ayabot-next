import { useState, useRef, useCallback, useEffect, useSyncExternalStore } from 'react';
import { AudioQueue, AudioRecorder, type SpeechFeatures } from '../utils/audioProcessing';
import { AYADI_SYSTEM_PROMPT, FAREWELL_PROMPT, GREETING_PROMPT } from '../constants/prompts';

const API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
const MODEL_NAME = "gemini-2.5-flash-native-audio-preview-09-2025";
// const MODEL_NAME = "gemini-3.1-flash-live-preview";
const WS_URL = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${API_KEY}`;

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

export function useGeminiLive() {
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
  const setupCompleteRef = useRef(false);
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
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
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
    setupCompleteRef.current = false;
    modelTurnActiveRef.current = false;
    mutedRef.current = false;
    setIsMuted(false);
    setIsSpeaking(false);
    setIsUserSpeaking(false);
    setConnectedAt(null);
  }, []);

  const fail = useCallback((message: string) => {
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
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true,
      },
    }));
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

    if (!API_KEY) {
      console.error("Missing NEXT_PUBLIC_GEMINI_API_KEY environment variable.");
      fail('The Gemini API key is missing. Add NEXT_PUBLIC_GEMINI_API_KEY to .env.local and restart the app.');
      return;
    }

    manualCloseRef.current = false;
    updateStatus('connecting');
    logEvent('connecting', 'Connecting to Aya');

    try {
      // Initialize audio tools
      audioQueueRef.current = new AudioQueue();
      audioQueueRef.current.setVolume(getVolumeSnapshot());
      await audioQueueRef.current.resume();

      audioRecorderRef.current = new AudioRecorder();

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = async () => {
        // Send Initial Setup Message
        const configMessage = {
          setup: {
            model: `models/${MODEL_NAME}`,
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: "Aoede", // Warm and friendly voice
                  }
                }
              }
            },
            systemInstruction: {
              parts: [{ text: AYADI_SYSTEM_PROMPT }]
            },
            // Text transcripts of both sides power the live activity panel.
            inputAudioTranscription: {},
            outputAudioTranscription: {},
          }
        };

        ws.send(JSON.stringify(configMessage));

        // Start microphone and attach callback
        try {
          await audioRecorderRef.current?.start();
        } catch (micError) {
          console.warn('Microphone failed to start:', micError);
          fail(describeMicError(micError));
          return;
        }

        if (wsRef.current !== ws) return;

        const recorder = audioRecorderRef.current;
        if (recorder) {
          recorder.setMuted(mutedRef.current);

          recorder.onSilence = () => {
            // Let Gemini's server-side VAD handle response triggering.
            // Manual turnComplete injections currently cause API 1011 parsing errors.
            setIsSpeaking(false);
            setIsUserSpeaking(false);
          };

          recorder.onSpeech = () => {
            // User has started speaking — stop bot audio and re-enable mic
            audioQueueRef.current?.stop();
            setIsSpeaking(false);
            setIsUserSpeaking(true);
            logEvent('user-speaking', 'You are speaking');
            if (audioRecorderRef.current) {
              audioRecorderRef.current.suppressVAD = false;
            }
          };

          recorder.onAudioData = (base64Data) => {
            // Always send audio to Gemini (its server-side VAD needs the stream)
            // But skip sending while bot is speaking (echo suppression)
            if (ws.readyState === WebSocket.OPEN && !audioRecorderRef.current?.suppressVAD && !mutedRef.current) {
              ws.send(JSON.stringify({
                realtimeInput: {
                  mediaChunks: [{
                    data: base64Data,
                    mimeType: 'audio/pcm;rate=16000'
                  }]
                }
              }));
            }
          };
        }

        updateStatus('connected');
        setConnectedAt(Date.now());
        lastTurnEndAtRef.current = Date.now();
        logEvent('connected', 'Connected to Aya');
        logEvent('listening', 'Listening for your voice');
      };

      ws.onmessage = async (event) => {
        // Handle Blob to text if needed
        let dataStr = event.data;
        if (dataStr instanceof Blob) {
          dataStr = await dataStr.text();
        } else if (typeof dataStr !== 'string') {
          console.warn('Received non-string data over WS', event.data);
          return;
        }

        try {
          const response = JSON.parse(dataStr);

          if (response.setupComplete) {
            setupCompleteRef.current = true;
            const pending = pendingPromptRef.current;
            pendingPromptRef.current = null;
            // Answer the question the call was started with, or have Aya open with a greeting.
            if (ws.readyState === WebSocket.OPEN) {
              if (pending) sendPrompt(ws, pending);
              else sendPrompt(ws, GREETING_PROMPT, true);
            }
          }

          if (response.serverContent) {
            const serverContent = response.serverContent;

            if (serverContent.inputTranscription?.text) {
              appendTranscript('user', serverContent.inputTranscription.text);
            }

            if (serverContent.outputTranscription?.text) {
              appendTranscript('aya', serverContent.outputTranscription.text);
            }

            // Check for Audio
            if (serverContent.modelTurn?.parts) {
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
              setIsSpeaking(true);
              if (endingRef.current) farewellAudioRef.current = true;
              // Suppress mic VAD while bot audio plays (echo suppression)
              if (audioRecorderRef.current) {
                audioRecorderRef.current.suppressVAD = true;
              }
              for (const part of serverContent.modelTurn.parts) {
                if (part.inlineData) {
                  // Play the received audio via our Queue
                  const audioData = part.inlineData.data;
                  audioQueueRef.current?.playBase64PCM(audioData, 24000);
                }
              }
            }

            if (serverContent.interrupted) {
              audioQueueRef.current?.stop();
              // Audio before this point belonged to the reply the goodbye cut off.
              farewellAudioRef.current = false;
              if (modelTurnActiveRef.current) {
                modelTurnActiveRef.current = false;
                lastTurnEndAtRef.current = Date.now();
                finalizeTranscript('aya', true);
                logEvent('interrupted', 'You interrupted Aya');
              }
            }

            // When the bot's turn is complete, re-enable mic after a short delay
            if (serverContent.turnComplete) {
              modelTurnActiveRef.current = false;
              lastTurnEndAtRef.current = Date.now();
              finalizeTranscript();
              logEvent('turn-complete', 'Aya finished replying');
              // The goodbye has been fully received: hang up when it finishes playing.
              if (endingRef.current && farewellAudioRef.current) hangUpAfterPlayback();
              setTimeout(() => {
                setIsSpeaking(false);
                if (audioRecorderRef.current) {
                  audioRecorderRef.current.suppressVAD = false;
                }
              }, 300); // 300ms grace period for echo to fade
            }
          }
        } catch (err) {
          console.error("Failed to parse socket message", err);
        }
      };

      ws.onclose = (closeEvent) => {
        if (manualCloseRef.current || wsRef.current !== ws) return;
        const reason = closeEvent.reason ? `: ${closeEvent.reason}` : '';
        fail(`The connection to Gemini closed unexpectedly (code ${closeEvent.code}${reason}).`);
      };

      ws.onerror = (wsError) => {
        console.error('WebSocket Error:', wsError);
      };

    } catch (e: unknown) {
      console.error('Failed to start:', e);
      fail('Could not start the conversation. Check your connection and try again.');
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
      !setupCompleteRef.current ||
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
    if (statusRef.current === 'connected' && setupCompleteRef.current && ws?.readyState === WebSocket.OPEN) {
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
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
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
