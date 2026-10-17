// TEMP-DEBUG: VAD measurement logger (Step 0). Records what the local voice detector sees,
// grouped into ~250 ms windows, and exposes it on `window.__vad` for inspection in DevTools.
// Nothing is printed unless you call one of its helpers. To remove: delete this file and the
// lines marked TEMP-DEBUG in src/utils/audioProcessing.ts.

type BlockState = 'live' | 'suppressed' | 'muted';

type VadWindow = {
  /** ms since the logger started */
  t: number;
  label: string;
  state: BlockState;
  /** RMS of the whole window, 16-bit units (what the VAD measures, after the worklet gate) */
  rms: number;
  /** loudest single block in the window */
  rmsPeak: number;
  /** smoothed RMS at the end of the window (compared against the 1000 threshold) */
  smoothed: number;
  smoothedPeak: number;
  /** local VAD speaking flag at the end of the window */
  speaking: boolean;
  /** speech-start events inside the window */
  starts: number;
  /** speech-end events inside the window */
  ends: number;
};

type VadEvent = { t: number; label: string; kind: 'start' | 'end'; smoothed: number };

const WINDOW_MS = 250;
const MAX_WINDOWS = 2400; // ~10 minutes
const MAX_EVENTS = 500;
const VAD_THRESHOLD = 1000; // mirrors AudioRecorder.SILENCE_THRESHOLD

const origin = typeof performance !== 'undefined' ? performance.now() : 0;
const now = () => Math.round(performance.now() - origin);

let label = 'unlabelled';
let windows: VadWindow[] = [];
let events: VadEvent[] = [];

let acc = { ms: 0, sumSquares: 0, peak: 0, smoothedPeak: 0, starts: 0, ends: 0 };

function resetAcc() {
  acc = { ms: 0, sumSquares: 0, peak: 0, smoothedPeak: 0, starts: 0, ends: 0 };
}

export function blockRms(samples: Int16Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export function recordVadBlock(rms: number, smoothed: number, speaking: boolean, state: BlockState, blockMs: number) {
  install();
  acc.ms += blockMs;
  acc.sumSquares += rms * rms * blockMs;
  acc.peak = Math.max(acc.peak, rms);
  acc.smoothedPeak = Math.max(acc.smoothedPeak, smoothed);
  if (acc.ms < WINDOW_MS) return;

  windows.push({
    t: now(),
    label,
    state,
    rms: Math.round(Math.sqrt(acc.sumSquares / acc.ms)),
    rmsPeak: Math.round(acc.peak),
    smoothed: Math.round(smoothed),
    smoothedPeak: Math.round(acc.smoothedPeak),
    speaking,
    starts: acc.starts,
    ends: acc.ends,
  });
  if (windows.length > MAX_WINDOWS) windows = windows.slice(-MAX_WINDOWS);
  resetAcc();
}

export function recordVadEvent(kind: 'start' | 'end', smoothed: number) {
  install();
  if (kind === 'start') acc.starts++;
  else acc.ends++;
  events.push({ t: now(), label, kind, smoothed: Math.round(smoothed) });
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function summary() {
  const labels = [...new Set(windows.map(w => w.label))];
  const rows = labels.map(name => {
    const live = windows.filter(w => w.label === name && w.state === 'live');
    const rms = live.map(w => w.rms).sort((a, b) => a - b);
    const smoothed = live.map(w => w.smoothedPeak).sort((a, b) => a - b);
    const speakingWindows = live.filter(w => w.speaking).length;
    return {
      label: name,
      seconds: +(live.length * WINDOW_MS / 1000).toFixed(1),
      'rms p10': percentile(rms, 10),
      'rms p50': percentile(rms, 50),
      'rms p90': percentile(rms, 90),
      'rms max': rms.at(-1) ?? 0,
      'smoothed p50': percentile(smoothed, 50),
      'smoothed p90': percentile(smoothed, 90),
      'smoothed max': smoothed.at(-1) ?? 0,
      '% over 1000': live.length ? Math.round((live.filter(w => w.smoothedPeak > VAD_THRESHOLD).length / live.length) * 100) : 0,
      '% speaking': live.length ? Math.round((speakingWindows / live.length) * 100) : 0,
      'speech starts': events.filter(e => e.label === name && e.kind === 'start').length,
    };
  });
  console.table(rows);
  return rows;
}

function install() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __vad?: unknown };
  if (w.__vad) return;
  w.__vad = {
    /** Start a new labelled segment, e.g. __vad.mark('fan'). */
    mark(name: string) {
      label = String(name);
      resetAcc();
      console.info(`[vad] segment: ${label}`);
    },
    /** Per-label stats (live windows only) as a console table. */
    summary,
    /** Last n windows as a console table (default 40 = 10 s). */
    table(n = 40) {
      console.table(windows.slice(-n));
    },
    /** Speech start/end events as a console table. */
    events() {
      console.table(events);
    },
    /** JSON of everything; in DevTools run copy(__vad.export()) to put it on the clipboard. */
    export() {
      return JSON.stringify({ windowMs: WINDOW_MS, threshold: VAD_THRESHOLD, windows, events });
    },
    /** Clear all recorded data (keeps the current label). */
    reset() {
      windows = [];
      events = [];
      resetAcc();
    },
    get windows() {
      return windows;
    },
  };
  console.info('[vad] TEMP-DEBUG logger ready: __vad.mark(label), __vad.summary(), __vad.table(), __vad.events(), copy(__vad.export())');
}

// Available as soon as the page loads, so a segment can be labelled before starting a call.
install();
