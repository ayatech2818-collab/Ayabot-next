"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useGeminiLive } from "../hooks/useGeminiLive";
import dynamic from "next/dynamic";

const RobotScene = dynamic(() => import("./RobotScene"), {
  ssr: false,
  loading: () => (
    <div className="robot-loading-container">
      <div className="robot-loading-spinner" />
      <div className="robot-loading-text">Initializing AYABOT...</div>
    </div>
  ),
});

function VolumeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 2v6h-6" />
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M3 22v-6h6" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
    </svg>
  );
}

function MicIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function ArrowRightIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function EndCallIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect width="12" height="12" x="6" y="6" rx="2" fill="currentColor" />
    </svg>
  );
}

function AdmissionsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  );
}

function CoursesIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
      <path d="M6 6h10" />
      <path d="M6 10h10" />
    </svg>
  );
}

function StudentLifeIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
    </svg>
  );
}

function ThemeIcon({ light }: { light: boolean }) {
  return light ? (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />
    </svg>
  ) : (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </svg>
  );
}

// Pre-calculated deterministic cosmic star positions to prevent hydration mismatch and cascading renders
const STARS_DATA = Array.from({ length: 82 }, (_, i) => {
  const x = ((i * 37 + 13) % 98) + 1;
  const y = ((i * 59 + 7) % 86) + 1;
  const delay = (((i * 23) % 40) / 10).toFixed(1);
  const duration = (6 + ((i * 17) % 60) / 10).toFixed(1);
  
  let className = "star star-distant";
  if (i >= 74) {
    className = "star star-cyan-glow";
  } else if (i % 3 === 0) {
    className = "star star-bright";
  } else if (i % 2 === 0) {
    className = "star star-mid";
  }

  return {
    id: i,
    className,
    style: {
      left: `${x}%`,
      top: `${y}%`,
      animationDelay: `${delay}s`,
      animationDuration: `${duration}s`,
    } as React.CSSProperties,
  };
});

const PARTICLES_DATA = Array.from({ length: 9 }, (_, i) => ({
  id: i,
  style: {
    left: `${12 + ((i * 31) % 78)}%`,
    top: `${22 + ((i * 19) % 58)}%`,
    animationDelay: `${i * -2.7}s`,
    animationDuration: `${22 + (i % 4) * 5}s`,
  } as React.CSSProperties,
}));

function SpaceBackground() {
  return (
    <div className="space-environment" aria-hidden="true">
      {/* Cinematic atmospheric nebula behind robot */}
      <div className="space-nebula" />

      {/* Delicate orbital energy curves */}
      <div className="orbital-arcs">
        <svg
          className="orbital-svg"
          viewBox="0 0 1440 900"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="orbitGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00e5ff" stopOpacity="0" />
              <stop offset="35%" stopColor="#00e5ff" stopOpacity="0.22" />
              <stop offset="65%" stopColor="#2dd4bf" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#00e5ff" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="orbitGrad2" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0" />
              <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.15" />
              <stop offset="75%" stopColor="#0284c7" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <ellipse
            cx="720"
            cy="480"
            rx="650"
            ry="240"
            stroke="url(#orbitGrad1)"
            strokeWidth="1.2"
            transform="rotate(-12 720 480)"
            strokeDasharray="4 8"
          />
          <ellipse
            cx="720"
            cy="450"
            rx="820"
            ry="310"
            stroke="url(#orbitGrad2)"
            strokeWidth="1"
            transform="rotate(9 720 450)"
          />
        </svg>
      </div>

      {/* Multi-depth Stars */}
      <div className="starfield">
        {STARS_DATA.map((star) => (
          <div key={star.id} className={star.className} style={star.style} />
        ))}
      </div>

      <div className="space-particles">
        {PARTICLES_DATA.map((particle) => <i key={particle.id} style={particle.style} />)}
      </div>

      {/* Curved Planetary Horizon near bottom of screen */}
      <div className="planetary-horizon">
        <div className="planet-disc" />
      </div>
    </div>
  );
}

export default function VoiceChat() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [themeReady, setThemeReady] = useState(false);
  const {
    isConnected,
    isSpeaking,
    connect,
    disconnect,
    getPlaybackLevel,
  } = useGeminiLive();

  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);

  useEffect(() => {
    let storedTheme: string | null = null;
    try {
      storedTheme = window.localStorage.getItem("ayabot-theme");
    } catch {
      // Storage may be disabled by the browser; the OS preference still applies.
    }
    const initialTheme: "dark" | "light" = storedTheme === "light" || storedTheme === "dark"
      ? storedTheme
      : window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    setTheme(initialTheme);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (themeReady) {
      try {
        window.localStorage.setItem("ayabot-theme", theme);
      } catch {
        // Theme selection remains active for this page even when storage is blocked.
      }
    }
  }, [theme, themeReady]);

  const handleToggleConnection = useCallback(() => {
    if (isConnected) {
      disconnect();
    } else {
      void connect();
    }
  }, [isConnected, connect, disconnect]);

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Date.now() - pointerStartRef.current.time;
    pointerStartRef.current = null;

    // Only an intentional tap/click on Aya toggles the voice session.
    if (dist < 6 && duration < 600) {
      handleToggleConnection();
    }
  };

  const handleRobotKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleToggleConnection();
    }
  };

  const handleTopicClick = useCallback(() => {
    // Connect to start session if not connected, allowing user to ask about topic
    if (!isConnected) {
      void connect();
    }
  }, [isConnected, connect]);

  let statusLabel = "Ready";
  let statusSub = "TAP TO BEGIN";

  if (isConnected && isSpeaking) {
    statusLabel = "Speaking...";
    statusSub = "AI RESPONSE ACTIVE";
  } else if (isConnected) {
    statusLabel = "Listening...";
    statusSub = "VOICE INPUT ACTIVE";
  }

  return (
    <div className="landing-viewport" data-theme={theme}>
      <SpaceBackground />

      {/* Top Navbar */}
      <nav className="navbar" id="navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">
            <span className="navbar-logo-glyph">A</span>
          </div>
          <span className="navbar-title">AYABOT</span>
        </div>

        <div className="navbar-controls">
          <div
            className={`navbar-badge ${
              isConnected ? "online" : "offline"
            }`}
          >
            <span className="badge-dot" />
            <span>{isConnected ? "ONLINE" : "READY"}</span>
          </div>

          <button
            className="navbar-icon-btn theme-toggle"
            type="button"
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            aria-pressed={theme === "light"}
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            <ThemeIcon light={theme === "light"} />
          </button>

          <button
            className="navbar-icon-btn"
            type="button"
            aria-label="Toggle volume"
            id="btn-volume"
            title="Volume control is not configured"
            disabled
          >
            <VolumeIcon />
          </button>

          <button
            className="navbar-icon-btn"
            type="button"
            aria-label="Reset session and disconnect"
            id="btn-reset"
            onClick={disconnect}
            title="Reset conversation"
          >
            <ResetIcon />
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="main-content" id="main-content">
        <div className="hero-composition" id="assistant-panel">
          {/* Heading & Supporting Text */}
          <header className="panel-header">
            <span className="panel-eyebrow">YOUR AI SCHOOL GUIDE</span>
            <h1 className="panel-title">
              Hi, I&apos;m <span className="title-highlight">Aya.</span>
            </h1>
            <p className="panel-description">
              Ask me anything about admissions.
            </p>
          </header>

          {/* Central 3D Robot */}
          <div className="robot-stage">
            <div className="robot-glow-backdrop" aria-hidden="true" />
            <div
              className={`robot-canvas-wrapper ${
                isConnected ? "is-connected" : "is-standby"
              }`}
              role="button"
              tabIndex={0}
              aria-label={
                isConnected
                  ? "Disconnect AYABOT"
                  : "Start conversation with AYABOT"
              }
              aria-pressed={isConnected}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onKeyDown={handleRobotKeyDown}
              title={
                isConnected
                  ? "Click to disconnect"
                  : "Click to start a conversation"
              }
            >
              <RobotScene getPlaybackLevel={getPlaybackLevel} />
            </div>
          </div>

          {/* Status Feedback Indicator */}
          <div className="panel-status-area" aria-live="polite">
            <div
              className={`status-pill ${
                isConnected
                  ? isSpeaking
                    ? "status-speaking"
                    : "status-listening"
                  : "status-idle"
              }`}
            >
              <span className="status-ping-dot" />
              <span className="status-main-label">{statusLabel}</span>
              {isConnected && (
                <span className="status-tag-sub">{statusSub}</span>
              )}
            </div>
          </div>

          {/* Primary Call to Action Button */}
          <div className="panel-cta-area">
            <button
              type="button"
              className={`primary-cta-button ${
                isConnected ? "session-active" : "session-standby"
              }`}
              onClick={handleToggleConnection}
              aria-label={
                isConnected ? "End conversation" : "Start a conversation"
              }
            >
              <span className="cta-btn-shimmer" aria-hidden="true" />
              <span className="cta-btn-content">
                {isConnected ? (
                  <>
                    <EndCallIcon />
                    <span className="cta-btn-label">End conversation</span>
                  </>
                ) : (
                  <>
                    <MicIcon />
                    <span className="cta-btn-label">Start a conversation</span>
                    <ArrowRightIcon />
                  </>
                )}
              </span>
            </button>

            <p className="cta-subtext">
              Tap the robot or press the button to begin
            </p>
          </div>
        </div>

        {/* Quick-Access Links Below Panel */}
        <nav className="quick-links-bar" aria-label="Quick inquiry topics">
          <button
            type="button"
            className="quick-link-pill"
            onClick={handleTopicClick}
            title="Ask Aya about admissions"
          >
            <AdmissionsIcon />
            <span>Admissions</span>
          </button>
          <button
            type="button"
            className="quick-link-pill"
            onClick={handleTopicClick}
            title="Ask Aya about courses"
          >
            <CoursesIcon />
            <span>Courses</span>
          </button>
          <button
            type="button"
            className="quick-link-pill"
            onClick={handleTopicClick}
            title="Ask Aya about student life"
          >
            <StudentLifeIcon />
            <span>Student life</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
