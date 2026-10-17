/**
 * audioProcessing.ts
 * Utilities for capturing, downsampling, playing, and converting raw PCM audio for Gemini Live.
 */

import { blockRms, recordVadBlock, recordVadEvent } from './vadDebug'; // TEMP-DEBUG

// Converts a base64 string to a Uint8Array
export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Converts a Uint8Array to a base64 string
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Converts 16-bit PCM (Uint8Array of Int16s) to Float32Array for AudioContext playback
export function pcm16ToFloat32(pcmData: Uint8Array): Float32Array {
  const int16Array = new Int16Array(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength / 2);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    // Normalize Int16 to Float32 [-1, 1]
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
}

// Very basic inline AudioWorklet code to handle downsampling to 16kHz and packaging as 16-bit PCM.
// Improved AudioWorklet for aggressive noise gating and adaptive floor tracking.
const AudioWorkletSrc = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.noiseFloor = 0.001;
    this.alpha = 0.005; // EMA for noise tracking
  }
  
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input.length > 0) {
      const channelData = input[0];
      
      // Calculate RMS for this chunk
      let sumSquares = 0;
      for (let i = 0; i < channelData.length; i++) {
          sumSquares += channelData[i] * channelData[i];
      }
      const rms = Math.sqrt(sumSquares / channelData.length);

      // Adaptively update noise floor
      if (rms < this.noiseFloor * 2.0) {
          this.noiseFloor = this.alpha * rms + (1 - this.alpha) * this.noiseFloor;
      }
      
      // More aggressive multiplier (4.0x) to block outer mic noise
      const dynamicThreshold = Math.max(0.003, this.noiseFloor * 4.0);
      
      // Aggressive noise gate
      let gain = 1.0;
      if (rms < dynamicThreshold) {
          gain = Math.max(0, rms / dynamicThreshold);
          // Cubic curve for sharper cutoff
          gain = gain * gain * gain;
      }

      // Convert Float32 to Int16 with gain and soft clipping
      const int16Data = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        let s = channelData[i] * gain;
        s = Math.max(-1, Math.min(1, s));
        int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(int16Data.buffer, [int16Data.buffer]);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

/** Snapshot of the speech Aya is playing right now, used to drive lip-sync. */
export type SpeechFeatures = {
  /** Time-domain RMS of the output, roughly 0..0.3 for speech. */
  level: number;
  /** Share of speech energy at 150–900 Hz (open vowels like "ah", "oh"). */
  low: number;
  /** Share at 900–2800 Hz (front vowels like "ee", "eh"). */
  mid: number;
  /** Share at 2800–8000 Hz (fricatives like "s", "sh", "f"). */
  high: number;
  /** Power-weighted spectral centroid in Hz (0 when silent). */
  centroid: number;
};

const SILENT_FEATURES: SpeechFeatures = { level: 0, low: 0, mid: 0, high: 0, centroid: 0 };

export class AudioQueue {
  private audioContext: AudioContext | null = null;
  private nextPlayTime: number = 0;
  private activeSources: AudioBufferSourceNode[] = [];

  private analyser: AnalyserNode | null = null;
  private outputGain: GainNode | null = null;
  private analyserData = new Uint8Array(512);
  private frequencyData = new Float32Array(256);
  private playbackLevel = 0;
  private volume = 1;

  get currentPlaybackLevel(): number {
    return this.playbackLevel;
  }

  /** True when audio is currently being played through speakers */
  get isPlaying(): boolean {
    return this.activeSources.length > 0;
  }

  /** Milliseconds of already-queued audio still left to play. */
  get remainingMs(): number {
    if (!this.audioContext || this.activeSources.length === 0) return 0;
    return Math.max(0, this.nextPlayTime - this.audioContext.currentTime) * 1000;
  }

  constructor() {
    if (typeof window !== 'undefined') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      this.audioContext = new AudioContextClass({
        sampleRate: 24000,
      });

      this.analyser = this.audioContext.createAnalyser();
      // 512 samples at 24 kHz ≈ 21 ms windows with 47 Hz bins: fine enough to tell vowels apart.
      this.analyser.fftSize = 512;
      // Light smoothing keeps the spectrum responsive for syllable-level lip movement.
      this.analyser.smoothingTimeConstant = 0.35;

      // The analyser sits before the volume gain so lip-sync stays visible at low volume.
      this.outputGain = this.audioContext.createGain();
      this.outputGain.gain.value = this.volume;
      this.analyser.connect(this.outputGain);
      this.outputGain.connect(this.audioContext.destination);
    }
  }

  /** Set speaker volume between 0 (silent) and 1 (full). */
  setVolume(value: number) {
    this.volume = Math.min(1, Math.max(0, value));
    if (this.outputGain && this.audioContext) {
      this.outputGain.gain.setTargetAtTime(this.volume, this.audioContext.currentTime, 0.02);
    }
  }

  async resume() {
    if (this.audioContext?.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  playBase64PCM(base64: string, sampleRate = 24000) {
    if (!this.audioContext) return;

    // Resume context if needed
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const uint8Data = base64ToUint8Array(base64);
    const float32Data = pcm16ToFloat32(uint8Data);

    const audioBuffer = this.audioContext.createBuffer(1, float32Data.length, sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.analyser ?? this.audioContext.destination);

    // Track active sources for stopping
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s !== source);
    };
    this.activeSources.push(source);

    // Schedule gapless playback
    const currentTime = this.audioContext.currentTime;
    if (this.nextPlayTime < currentTime) {
      this.nextPlayTime = currentTime;
    }

    source.start(this.nextPlayTime);
    this.nextPlayTime += audioBuffer.duration;
  }

  stop() {
    // Stop all currently playing audio chunks
    this.activeSources.forEach(source => {
      try {
        source.stop();
      } catch {
        // Ignore if already stopped
      }
    });
    this.activeSources = [];
    this.playbackLevel = 0;

    // Reset next play time to current time
    if (this.audioContext) {
      this.nextPlayTime = this.audioContext.currentTime;
    }
  }

  close() {
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }

      this.audioContext = null;
    }

    this.playbackLevel = 0;
  }

  updatePlaybackLevel(): number {
    if (!this.analyser || this.activeSources.length === 0) {
      this.playbackLevel = 0;
      return 0;
    }

    this.analyser.getByteTimeDomainData(this.analyserData);

    let sum = 0;

    for (const sample of this.analyserData) {
      const value = (sample - 128) / 128;
      sum += value * value;
    }

    this.playbackLevel = Math.sqrt(sum / this.analyserData.length);

    return this.playbackLevel;
  }

  /** Loudness plus a coarse spectral breakdown of the audio playing now. */
  getSpeechFeatures(): SpeechFeatures {
    const level = this.updatePlaybackLevel();
    if (!this.analyser || !this.audioContext || level < 0.002) return SILENT_FEATURES;

    this.analyser.getFloatFrequencyData(this.frequencyData);
    const binHz = this.audioContext.sampleRate / this.analyser.fftSize;

    let low = 0;
    let mid = 0;
    let high = 0;
    let weighted = 0;
    for (let i = 0; i < this.frequencyData.length; i++) {
      const hz = i * binHz;
      if (hz < 150 || hz > 8000) continue;
      const db = this.frequencyData[i];
      if (!Number.isFinite(db)) continue;
      const power = Math.pow(10, db / 10);
      weighted += power * hz;
      if (hz < 900) low += power;
      else if (hz < 2800) mid += power;
      else high += power;
    }

    const total = low + mid + high;
    if (total <= 0) return { ...SILENT_FEATURES, level };
    return {
      level,
      low: low / total,
      mid: mid / total,
      high: high / total,
      centroid: weighted / total,
    };
  }

}

export class AudioRecorder {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  public onAudioData: ((base64Data: string) => void) | null = null;

  // Local VAD Callbacks
  public onSilence: (() => void) | null = null;
  public onSpeech: (() => void) | null = null;

  /** Set to true while bot audio is playing to suppress echo detection */
  public suppressVAD: boolean = false;

  /** Timestamp (ms) of the last chunk that crossed the voice threshold. */
  public lastVoiceAt: number = 0;

  /** When muted, no audio is analysed or sent. */
  private isMuted: boolean = false;

  private isSpeaking: boolean = false;
  private silenceMs: number = 0;
  private smoothedRms: number = 0;
  private readonly RMS_ALPHA = 0.1; // Smoothing factor for VAD RMS
  private readonly SILENCE_THRESHOLD = 1000; // Increased threshold for stability
  // Quiet needed to end speech, counted once the recent-loudness window below has drained
  // (up to ~0.25 s), so speech still ends about as quickly as before.
  private readonly REQUIRED_SILENCE_MS = 1000;
  // Voice is judged by how much of the last 250 ms was loud, not by single blocks: clicks, key
  // presses and bumps are too short to start "speaking" or keep it alive, while the short gaps
  // between syllables don't reset the count the way a strict unbroken run would.
  private readonly LOUD_WINDOW_MS = 250;
  private readonly SPEECH_START_MS = 90;
  private readonly SPEECH_KEEPALIVE_MS = 80;
  /** Duration and loudness of each block in the last LOUD_WINDOW_MS. */
  private loudHistory: { ms: number; loud: boolean }[] = [];
  private historyMs: number = 0;
  private loudMs: number = 0;

  private resetLoudHistory() {
    this.loudHistory = [];
    this.historyMs = 0;
    this.loudMs = 0;
  }

  private trackLoudness(rms: number, blockMs: number) {
    const loud = rms > this.SILENCE_THRESHOLD;
    this.loudHistory.push({ ms: blockMs, loud });
    this.historyMs += blockMs;
    if (loud) this.loudMs += blockMs;
    while (this.loudHistory.length > 1 && this.historyMs - this.loudHistory[0].ms >= this.LOUD_WINDOW_MS) {
      const old = this.loudHistory.shift()!;
      this.historyMs -= old.ms;
      if (old.loud) this.loudMs -= old.ms;
    }
  }

  get speaking(): boolean {
    return this.isSpeaking;
  }

  /** Smoothed microphone RMS in 16-bit sample units (0 while muted or suppressed). */
  get inputLevel(): number {
    return this.smoothedRms;
  }

  get muted(): boolean {
    return this.isMuted;
  }

  setMuted(muted: boolean) {
    this.isMuted = muted;
    this.stream?.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
    if (muted) {
      this.isSpeaking = false;
      this.silenceMs = 0;
      this.resetLoudHistory();
      this.smoothedRms = 0;
      this.audioBuffer = [];
      this.audioBufferLength = 0;
    }
  }

  private audioBuffer: Int16Array[] = [];
  private audioBufferLength: number = 0;
  private readonly SEND_CHUNK_SIZE = 4096; // 4096 samples at 16kHz = 256ms

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    this.stream.getAudioTracks().forEach(track => {
      track.enabled = !this.isMuted;
    });

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.context = new AudioContextClass({ sampleRate: 16000 });

    const source = this.context.createMediaStreamSource(this.stream);

    // High-pass filter: 200Hz (blocks low-end rumble and mechanical noise)
    const hpFilter = this.context.createBiquadFilter();
    hpFilter.type = 'highpass';
    hpFilter.frequency.value = 200;

    // Low-pass filter: 5000Hz (blocks high-end hiss where speech is minimal)
    const lpFilter = this.context.createBiquadFilter();
    lpFilter.type = 'lowpass';
    lpFilter.frequency.value = 5000;

    // Dynamics Compressor: Stabilizes input levels to help VAD and Noise Gate consistency
    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -30;
    compressor.knee.value = 20;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    const blob = new Blob([AudioWorkletSrc], { type: 'application/javascript' });
    const blobURL = URL.createObjectURL(blob);

    await this.context.audioWorklet.addModule(blobURL);

    this.workletNode = new AudioWorkletNode(this.context, 'pcm-processor');
    this.workletNode.port.onmessage = (event) => {
      if (this.onAudioData) {
        const int16Array = new Int16Array(event.data);

        // Skip all VAD and audio sending while muted or while bot is speaking (echo suppression)
        if (this.suppressVAD || this.isMuted) {
          recordVadBlock(blockRms(int16Array), 0, false, this.isMuted ? 'muted' : 'suppressed', (int16Array.length / 16000) * 1000); // TEMP-DEBUG
          this.isSpeaking = false;
          this.silenceMs = 0;
          this.resetLoudHistory();
          this.smoothedRms = 0;
          return;
        }

        // VAD Logic (RMS calculation with smoothing)
        let sumSquares = 0;
        for (let i = 0; i < int16Array.length; i++) {
          sumSquares += int16Array[i] * int16Array[i];
        }
        const rms = Math.sqrt(sumSquares / int16Array.length);

        // EMA smoothing for RMS to avoid jitter
        this.smoothedRms = this.RMS_ALPHA * rms + (1 - this.RMS_ALPHA) * this.smoothedRms;

        const chunkDurationMs = (int16Array.length / 16000) * 1000;

        this.trackLoudness(rms, chunkDurationMs);

        if (!this.isSpeaking && this.loudMs >= this.SPEECH_START_MS) {
          this.lastVoiceAt = Date.now();
          this.isSpeaking = true;
          this.silenceMs = 0;
          recordVadEvent('start', this.smoothedRms); // TEMP-DEBUG
          if (this.onSpeech) this.onSpeech();
        } else if (this.loudMs >= this.SPEECH_KEEPALIVE_MS) {
          this.lastVoiceAt = Date.now();
          this.silenceMs = 0;
        } else {
          // Quiet, or a burst too short to be voice: count towards the end of speech.
          if (this.isSpeaking) {
            this.silenceMs += chunkDurationMs;
            if (this.silenceMs > this.REQUIRED_SILENCE_MS) {
              this.isSpeaking = false;
              recordVadEvent('end', this.smoothedRms); // TEMP-DEBUG
              if (this.onSilence) this.onSilence();
            }
          }
        }
        recordVadBlock(rms, this.smoothedRms, this.isSpeaking, 'live', chunkDurationMs); // TEMP-DEBUG

        // Buffer audio to send larger chunks (reduces websocket latency overhead)
        this.audioBuffer.push(int16Array);
        this.audioBufferLength += int16Array.length;

        if (this.audioBufferLength >= this.SEND_CHUNK_SIZE) {
          const combined = new Int16Array(this.audioBufferLength);
          let offset = 0;
          for (const arr of this.audioBuffer) {
            combined.set(arr, offset);
            offset += arr.length;
          }
          const uint8Array = new Uint8Array(combined.buffer);
          const base64 = uint8ArrayToBase64(uint8Array);
          this.onAudioData(base64);

          // Reset buffer
          this.audioBuffer = [];
          this.audioBufferLength = 0;
        }
      }
    };

    source.connect(hpFilter);
    hpFilter.connect(lpFilter);
    lpFilter.connect(compressor);
    compressor.connect(this.workletNode);
    this.workletNode.connect(this.context.destination);
  }

  stop() {
    if (this.workletNode) {
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.context) {
      this.context.close();
      this.context = null;
    }
    this.isSpeaking = false;
    this.silenceMs = 0;
    this.resetLoudHistory();
    this.smoothedRms = 0;
  }
}
