"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useGeminiLive } from "../hooks/useGeminiLive";
import { useAudioLevels } from "../hooks/useAudioLevels";
import { useFullscreen } from "../hooks/useFullscreen";
import { useScene } from "../hooks/useScene";
import { useTheme } from "../hooks/useTheme";
import ActivityPanel from "./ActivityPanel";
import Backdrop from "./Backdrop";
import ControlDock from "./ControlDock";
import Stage from "./Stage";
import ThemeSwitcher from "./ThemeSwitcher";
import { MaximizeIcon, MinimizeIcon, PanelRightIcon, SceneIcon } from "./icons";
import { getPhase } from "./phase";
import styles from "./VoiceChat.module.css";

const STATUS_BADGE = {
  idle: "Ready",
  connecting: "Connecting",
  connected: "Live",
  error: "Offline",
} as const;

// Matches the CSS breakpoint where Live activity becomes a side panel instead of a bottom sheet.
const DESKTOP_QUERY = "(min-width: 961px)";
const subscribeDesktop = (listener: () => void) => {
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const getIsDesktop = () => window.matchMedia(DESKTOP_QUERY).matches;
const getServerDesktop = () => true;

export default function VoiceChat() {
  const rootRef = useRef<HTMLDivElement>(null);
  const { resolved: theme } = useTheme();
  const { sceneOn, setSceneOn } = useScene();
  const {
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
  } = useGeminiLive();

  const phase = getPhase({ status, isSpeaking, isUserSpeaking, isMuted, isEnding });

  // Desktop-only: hide Live activity so Aya's stage fills the width.
  const isDesktop = useSyncExternalStore(subscribeDesktop, getIsDesktop, getServerDesktop);
  const [panelOpen, setPanelOpen] = useState(true);
  const [seenCount, setSeenCount] = useState(0);
  // Increments on every full-screen change so the stage can cover the jump in size.
  const [viewEpoch, setViewEpoch] = useState(0);
  const unseen = panelOpen ? 0 : Math.max(0, transcript.length - seenCount);
  const { isFullscreen, supported: fullscreenSupported, toggle: toggleFullscreen } = useFullscreen();
  // Panel state to restore when leaving fullscreen (null = fullscreen wasn't entered from here).
  const restorePanelRef = useRef<boolean | null>(null);
  const enteringFullscreenRef = useRef(false);
  const latestRef = useRef({ panelOpen, transcriptLength: transcript.length });
  useEffect(() => {
    latestRef.current = { panelOpen, transcriptLength: transcript.length };
  }, [panelOpen, transcript.length]);

  const togglePanel = useCallback(() => {
    if (panelOpen) setSeenCount(transcript.length);
    setPanelOpen(!panelOpen);
  }, [panelOpen, transcript.length]);

  const handleFullscreen = useCallback(() => {
    enteringFullscreenRef.current = !isFullscreen;
    void toggleFullscreen().then(ok => {
      if (!ok) enteringFullscreenRef.current = false;
    });
  }, [isFullscreen, toggleFullscreen]);

  useEffect(() => {
    // React to the browser's event rather than the click: fullscreen can be refused, and Esc
    // or the browser's own controls can end it too.
    const onChange = () => {
      setViewEpoch(epoch => epoch + 1);
      if (document.fullscreenElement) {
        if (!enteringFullscreenRef.current) return;
        enteringFullscreenRef.current = false;
        // Focus on Aya: tuck the panel away while fullscreen, bring it back afterwards.
        const { panelOpen: open, transcriptLength } = latestRef.current;
        restorePanelRef.current = open;
        if (open) {
          setSeenCount(transcriptLength);
          setPanelOpen(false);
        }
      } else if (restorePanelRef.current !== null) {
        setPanelOpen(restorePanelRef.current);
        restorePanelRef.current = null;
      }
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useAudioLevels(rootRef, getPlaybackLevel, getInputLevel, status === "connected");

  const handleToggleCall = useCallback(() => {
    if (status === "connected") {
      // Aya says goodbye first; pressing again while she does closes right away.
      endConversation();
    } else if (status === "connecting") {
      disconnect();
    } else {
      void connect();
    }
  }, [status, connect, disconnect, endConversation]);

  const handleRetry = useCallback(() => {
    void connect();
  }, [connect]);

  return (
    <div ref={rootRef} className={styles.app} data-panel={panelOpen ? "open" : "closed"}>
      <Backdrop />

      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.logo} aria-hidden="true">A</span>
          <span className={styles.brandText}>
            <span className={styles.brandName}>AYABOT</span>
            <span className={styles.brandSub}>Ayadi Glocal School</span>
          </span>
        </div>

        <div className={styles.topbarActions}>
          <span className={styles.badge} data-status={status} role="status">
            <span className={styles.badgeDot} aria-hidden="true" />
            {STATUS_BADGE[status]}
          </span>
          <button
            type="button"
            className={styles.panelToggle}
            onClick={togglePanel}
            aria-pressed={!panelOpen}
            aria-controls="live-activity"
            title={panelOpen ? "Hide live activity" : "Show live activity"}
          >
            <PanelRightIcon open={panelOpen} size={17} strokeWidth={1.9} />
            <span className={styles.panelToggleLabel}>{panelOpen ? "Hide activity" : "Show activity"}</span>
            {unseen > 0 && (
              <span className={styles.unseen} aria-label={`${unseen} new`}>{unseen > 99 ? "99+" : unseen}</span>
            )}
          </button>
          <button
            type="button"
            className={`${styles.panelToggle} ${styles.sceneToggle}`}
            onClick={() => setSceneOn(!sceneOn)}
            aria-pressed={sceneOn}
            title={sceneOn ? "Turn off background scene" : "Turn on background scene"}
          >
            <SceneIcon size={16} strokeWidth={1.9} />
            <span className={styles.panelToggleLabel}>{sceneOn ? "Scene on" : "Scene off"}</span>
          </button>
          <ThemeSwitcher />
        </div>
      </header>

      <main className={styles.main} data-panel={panelOpen ? "open" : "closed"}>
        <Stage
          phase={phase}
          theme={theme}
          error={error}
          getSpeechFeatures={getSpeechFeatures}
          onRobotActivate={handleToggleCall}
          onTopic={askTopic}
          onRetry={handleRetry}
          onDismissError={dismissError}
          viewEpoch={viewEpoch}
          topActions={
            fullscreenSupported ? (
              <button
                type="button"
                className={styles.stageIconButton}
                onClick={handleFullscreen}
                aria-pressed={isFullscreen}
                aria-label={isFullscreen ? "Exit full screen" : "Full screen"}
                title={isFullscreen ? "Exit full screen (Esc)" : "Full screen"}
              >
                {isFullscreen ? <MinimizeIcon size={17} /> : <MaximizeIcon size={17} />}
              </button>
            ) : null
          }
          controls={
            <ControlDock
              status={status}
              isMuted={isMuted}
              isEnding={isEnding}
              volume={volume}
              hasHistory={transcript.length > 0 || events.length > 0}
              onToggleCall={handleToggleCall}
              onToggleMute={toggleMute}
              onVolumeChange={setVolume}
              onReset={resetSession}
            />
          }
        />

        <div className={styles.panelSlot} id="live-activity" inert={isDesktop && !panelOpen}>
          <ActivityPanel
            phase={phase}
            transcript={transcript}
            events={events}
            connectedAt={connectedAt}
            replyLatencyMs={replyLatencyMs}
          />
        </div>
      </main>
    </div>
  );
}
