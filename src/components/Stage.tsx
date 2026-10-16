"use client";

import dynamic from "next/dynamic";
import { useRef, type ReactNode } from "react";
import type { ResolvedTheme } from "../hooks/useTheme";
import type { SpeechFeatures } from "../utils/audioProcessing";
import { AdmissionsIcon, AlertIcon, CloseIcon, CoursesIcon, FeesIcon, SparkleIcon } from "./icons";
import { PHASE_COPY, type Phase } from "./phase";
import styles from "./Stage.module.css";

const RobotScene = dynamic(() => import("./RobotScene"), {
  ssr: false,
  loading: () => (
    <div className={styles.loading}>
      <div className={styles.loadingSpinner} />
      <div className={styles.loadingText}>Waking up Aya…</div>
    </div>
  ),
});

export const TOPICS = [
  {
    id: "admissions",
    label: "Admissions",
    Icon: AdmissionsIcon,
    prompt: "How does admission work at Ayadi Glocal School? Please tell me the steps and the documents I need.",
  },
  {
    id: "subjects",
    label: "Subjects & classes",
    Icon: CoursesIcon,
    prompt: "Which subjects are taught at Ayadi Glocal School, and what are the class timings?",
  },
  {
    id: "fees",
    label: "Fees",
    Icon: FeesIcon,
    prompt: "What are the fees at Ayadi Glocal School?",
  },
  {
    id: "student-life",
    label: "Student life",
    Icon: SparkleIcon,
    prompt: "What is student life like at Ayadi Glocal School? Tell me about activities and wellbeing programs.",
  },
] as const;

type StageProps = {
  phase: Phase;
  theme: ResolvedTheme;
  error: string | null;
  getSpeechFeatures: () => SpeechFeatures;
  onRobotActivate: () => void;
  onTopic: (prompt: string) => void;
  onRetry: () => void;
  onDismissError: () => void;
  /** Small buttons pinned to the stage's top-right corner (e.g. full screen). */
  topActions?: ReactNode;
  controls: ReactNode;
};

export default function Stage({
  phase,
  theme,
  error,
  getSpeechFeatures,
  onRobotActivate,
  onTopic,
  onRetry,
  onDismissError,
  topActions,
  controls,
}: StageProps) {
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const isActive = phase !== "idle" && phase !== "error";
  const copy = PHASE_COPY[phase];

  const handlePointerDown = (event: React.PointerEvent) => {
    pointerStartRef.current = { x: event.clientX, y: event.clientY, time: Date.now() };
  };

  const handlePointerUp = (event: React.PointerEvent) => {
    if (!pointerStartRef.current) return;
    const dx = event.clientX - pointerStartRef.current.x;
    const dy = event.clientY - pointerStartRef.current.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = Date.now() - pointerStartRef.current.time;
    pointerStartRef.current = null;

    // Only an intentional tap/click on Aya toggles the voice session.
    if (dist < 6 && duration < 600) {
      onRobotActivate();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onRobotActivate();
    }
  };

  return (
    <section className={styles.stage} data-phase={phase} aria-labelledby="stage-title">
      {topActions && <div className={styles.topActions}>{topActions}</div>}
      <header className={styles.intro}>
        <span className={styles.eyebrow}>Your AI school guide</span>
        <h1 id="stage-title" className={styles.title}>
          Hi, I&apos;m <span className={styles.highlight}>Aya</span>.
        </h1>
        <p className={styles.description}>
          Ask me about admissions, subjects, fees or student life — in English, Malayalam, Hindi or Arabic.
        </p>
      </header>

      <div className={styles.robotArea}>
        <div className={styles.halo} aria-hidden="true" />
        <div className={styles.ring} aria-hidden="true" />
        <div className={styles.ringPulse} aria-hidden="true" />

        <div
          className={styles.canvas}
          role="button"
          tabIndex={0}
          aria-label={isActive ? "End conversation with Aya" : "Start conversation with Aya"}
          aria-pressed={isActive}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onKeyDown={handleKeyDown}
          title={isActive ? "Tap to end the conversation" : "Tap to start talking"}
        >
          <RobotScene
            getSpeechFeatures={getSpeechFeatures}
            theme={theme}
            active={phase === "listening" || phase === "user-speaking" || phase === "aya-speaking" || phase === "muted"}
          />
        </div>

        <div className={styles.status} aria-live="polite">
          <span className={styles.statusDot} aria-hidden="true" />
          <span className={styles.statusLabel}>{copy.label}</span>
          <span className={styles.statusHint}>{copy.hint}</span>
        </div>
      </div>

      {error && (
        <div className={styles.error} role="alert">
          <AlertIcon size={18} className={styles.errorIcon} />
          <p className={styles.errorText}>{error}</p>
          <button type="button" className={styles.errorRetry} onClick={onRetry}>
            Try again
          </button>
          <button
            type="button"
            className={styles.errorClose}
            onClick={onDismissError}
            aria-label="Dismiss message"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      <div className={styles.bottom}>
        <nav className={styles.quickPanel} aria-labelledby="quick-questions-title">
          <div className={styles.quickHeader}>
            <span className={styles.quickBadge} aria-hidden="true">
              <SparkleIcon size={12} />
            </span>
            <span id="quick-questions-title" className={styles.quickTitle}>Quick questions</span>
            <span className={styles.quickHint}>Tap to ask Aya</span>
          </div>
          <div className={styles.topics}>
            {TOPICS.map(({ id, label, Icon, prompt }) => (
              <button
                key={id}
                type="button"
                className={styles.topic}
                onClick={() => onTopic(prompt)}
                disabled={phase === "connecting"}
                title={`Ask Aya: ${prompt}`}
              >
                <span className={styles.topicIcon} aria-hidden="true">
                  <Icon size={14} />
                </span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>
        {controls}
      </div>
    </section>
  );
}
