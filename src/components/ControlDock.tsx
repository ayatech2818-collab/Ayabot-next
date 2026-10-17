"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ConnectionStatus } from "../hooks/useGeminiLive";
import { MicIcon, MicOffIcon, PhoneOffIcon, ResetIcon, VolumeIcon } from "./icons";
import styles from "./ControlDock.module.css";

type ControlDockProps = {
  status: ConnectionStatus;
  isMuted: boolean;
  /** Aya is saying goodbye; pressing the call button again closes right away. */
  isEnding: boolean;
  volume: number;
  hasHistory: boolean;
  onToggleCall: () => void;
  onToggleMute: () => void;
  onVolumeChange: (value: number) => void;
  onReset: () => void;
};

export default function ControlDock({
  status,
  isMuted,
  isEnding,
  volume,
  hasHistory,
  onToggleCall,
  onToggleMute,
  onVolumeChange,
  onReset,
}: ControlDockProps) {
  const [volumeOpen, setVolumeOpen] = useState(false);
  const volumeRef = useRef<HTMLDivElement>(null);
  const sliderId = useId();
  const lastAudibleVolume = useRef(volume > 0 ? volume : 1);

  const isLive = status === "connected";
  const isConnecting = status === "connecting";

  useEffect(() => {
    if (volume > 0) lastAudibleVolume.current = volume;
  }, [volume]);

  useEffect(() => {
    if (!volumeOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!volumeRef.current?.contains(event.target as Node)) setVolumeOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setVolumeOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [volumeOpen]);

  const volumePercent = Math.round(volume * 100);

  return (
    <div className={styles.dock} role="toolbar" aria-label="Conversation controls">
      <button
        type="button"
        className={`${styles.iconButton} ${isMuted ? styles.danger : ""}`}
        onClick={onToggleMute}
        disabled={!isLive || isEnding}
        aria-pressed={isMuted}
        aria-label={isMuted ? "Unmute microphone" : "Mute microphone"}
        title={isLive ? (isMuted ? "Unmute microphone" : "Mute microphone") : "Start a conversation to use the microphone"}
      >
        {isMuted ? <MicOffIcon /> : <MicIcon />}
      </button>

      <button
        type="button"
        className={`${styles.callButton} ${isLive || isConnecting ? styles.callEnd : styles.callStart}`}
        onClick={onToggleCall}
        aria-label={isEnding ? "End now" : isLive ? "End conversation" : isConnecting ? "Cancel connecting" : "Start conversation"}
        title={isEnding ? "Aya is saying goodbye. Press to end now" : undefined}
      >
        {isEnding ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Ending…</span>
          </>
        ) : isConnecting ? (
          <>
            <span className={styles.spinner} aria-hidden="true" />
            <span>Connecting…</span>
          </>
        ) : isLive ? (
          <>
            <PhoneOffIcon size={18} />
            <span>End</span>
          </>
        ) : (
          <>
            <MicIcon size={18} />
            <span className={styles.labelLong}>Start conversation</span>
            <span className={styles.labelShort}>Start</span>
          </>
        )}
      </button>

      <div className={styles.volumeWrap} ref={volumeRef}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => setVolumeOpen(open => !open)}
          aria-expanded={volumeOpen}
          aria-controls={sliderId}
          aria-label={`Volume ${volumePercent}%`}
          title={`Volume ${volumePercent}%`}
        >
          <VolumeIcon level={volume} />
        </button>
        {volumeOpen && (
          <div className={styles.volumePopover} id={sliderId}>
            <button
              type="button"
              className={styles.volumeMute}
              onClick={() => onVolumeChange(volume > 0 ? 0 : lastAudibleVolume.current)}
              aria-label={volume > 0 ? "Mute Aya's voice" : "Unmute Aya's voice"}
            >
              <VolumeIcon level={volume} size={16} />
            </button>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={volumePercent}
              onChange={event => onVolumeChange(Number(event.target.value) / 100)}
              aria-label="Aya's voice volume"
              className={styles.slider}
              style={{ "--fill": `${volumePercent}%` } as React.CSSProperties}
            />
            <span className={styles.volumeValue}>{volumePercent}%</span>
          </div>
        )}
      </div>

      <button
        type="button"
        className={styles.iconButton}
        onClick={onReset}
        disabled={!hasHistory && status === "idle"}
        aria-label="Reset: end the conversation and clear activity"
        title="Reset conversation"
      >
        <ResetIcon />
      </button>
    </div>
  );
}
