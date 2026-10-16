"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ActivityEvent, ActivityKind, TranscriptEntry } from "../hooks/useGeminiLive";
import { ActivityIcon, ChatIcon, ChevronUpIcon } from "./icons";
import { PHASE_COPY, type Phase } from "./phase";
import styles from "./ActivityPanel.module.css";

type Tab = "transcript" | "timeline";

type ActivityPanelProps = {
  phase: Phase;
  transcript: TranscriptEntry[];
  events: ActivityEvent[];
  connectedAt: number | null;
  replyLatencyMs: number | null;
};

const EVENT_TONE: Record<ActivityKind, string> = {
  connecting: "warning",
  connected: "success",
  listening: "success",
  "user-speaking": "user",
  "aya-speaking": "accent",
  interrupted: "warning",
  "turn-complete": "muted",
  prompt: "user",
  muted: "danger",
  unmuted: "success",
  disconnected: "muted",
  error: "danger",
};

function formatClock(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

export default function ActivityPanel({ phase, transcript, events, connectedAt, replyLatencyMs }: ActivityPanelProps) {
  const [tab, setTab] = useState<Tab>("transcript");
  const [expanded, setExpanded] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const sheetStartY = useRef<number | null>(null);
  const swipedRef = useRef(false);
  const baseId = useId();

  const isLive = connectedAt !== null;
  const now = useNow(isLive);
  const exchanges = transcript.filter(entry => entry.role === "aya" && entry.final).length;
  const latest = transcript[transcript.length - 1];

  // Keep the newest transcript line in view unless the reader scrolled up.
  useEffect(() => {
    const list = listRef.current;
    if (tab === "transcript" && list && stickToBottomRef.current) {
      list.scrollTop = list.scrollHeight;
    }
  }, [transcript, tab]);

  const handleScroll = () => {
    const list = listRef.current;
    if (!list) return;
    stickToBottomRef.current = list.scrollHeight - list.scrollTop - list.clientHeight < 48;
  };

  const handleSheetPointerDown = (event: React.PointerEvent) => {
    sheetStartY.current = event.clientY;
  };

  const handleSheetPointerUp = (event: React.PointerEvent) => {
    if (sheetStartY.current === null) return;
    const dy = event.clientY - sheetStartY.current;
    sheetStartY.current = null;
    // A swipe already decided the state, so ignore the click that follows it.
    swipedRef.current = Math.abs(dy) > 30;
    if (dy < -30) setExpanded(true);
    else if (dy > 30) setExpanded(false);
  };

  const handleSheetClick = () => {
    if (swipedRef.current) {
      swipedRef.current = false;
      return;
    }
    setExpanded(open => !open);
  };

  const tabs: { id: Tab; label: string; count: number; Icon: typeof ChatIcon }[] = [
    { id: "transcript", label: "Transcript", count: transcript.length, Icon: ChatIcon },
    { id: "timeline", label: "Timeline", count: events.length, Icon: ActivityIcon },
  ];

  return (
    <aside
      className={styles.panel}
      data-expanded={expanded}
      data-live={isLive}
      aria-labelledby={`${baseId}-title`}
    >
      <button
        type="button"
        className={styles.sheetHandle}
        onClick={handleSheetClick}
        onPointerDown={handleSheetPointerDown}
        onPointerUp={handleSheetPointerUp}
        aria-expanded={expanded}
        aria-controls={`${baseId}-body`}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <span className={styles.sheetSummary}>
          <span className={styles.liveDot} aria-hidden="true" />
          <span className={styles.sheetTitle}>Live activity</span>
          <span className={styles.sheetPreview}>
            {latest ? `${latest.role === "aya" ? "Aya" : "You"}: ${latest.text.trim()}` : PHASE_COPY[phase].label}
          </span>
        </span>
        <ChevronUpIcon size={18} className={styles.chevron} />
      </button>

      <div className={styles.body} id={`${baseId}-body`}>
        <header className={styles.header}>
          <h2 id={`${baseId}-title`} className={styles.title}>
            <span className={styles.liveDot} aria-hidden="true" />
            Live activity
          </h2>
          <span className={styles.liveBadge}>{isLive ? "Live" : "Offline"}</span>
        </header>

        <dl className={styles.stats}>
          <div className={styles.stat}>
            <dt>Session</dt>
            <dd>{connectedAt ? formatDuration(now - connectedAt) : "--:--"}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Reply time</dt>
            <dd>{replyLatencyMs !== null ? `${(replyLatencyMs / 1000).toFixed(1)} s` : "—"}</dd>
          </div>
          <div className={styles.stat}>
            <dt>Replies</dt>
            <dd>{exchanges}</dd>
          </div>
        </dl>

        <div className={styles.meters} aria-hidden="true">
          <div className={styles.meter}>
            <span className={styles.meterLabel}>You</span>
            <span className={styles.meterTrack}>
              <span className={`${styles.meterFill} ${styles.meterUser}`} />
            </span>
          </div>
          <div className={styles.meter}>
            <span className={styles.meterLabel}>Aya</span>
            <span className={styles.meterTrack}>
              <span className={`${styles.meterFill} ${styles.meterAya}`} />
            </span>
          </div>
        </div>

        <div className={styles.tabs} role="tablist" aria-label="Activity views">
          {tabs.map(({ id, label, count, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${baseId}-tab-${id}`}
              aria-selected={tab === id}
              aria-controls={`${baseId}-panel-${id}`}
              className={styles.tab}
              onClick={() => setTab(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
              {count > 0 && <span className={styles.tabCount}>{count}</span>}
            </button>
          ))}
        </div>

        <div
          ref={listRef}
          className={styles.list}
          role="tabpanel"
          id={`${baseId}-panel-${tab}`}
          aria-labelledby={`${baseId}-tab-${tab}`}
          onScroll={handleScroll}
          tabIndex={0}
        >
          {tab === "transcript" ? (
            transcript.length === 0 ? (
              <EmptyState
                title="Your conversation will appear here"
                text="Start talking to Aya and you'll see what you both say, live."
              />
            ) : (
              <ol className={styles.transcript} aria-live="polite" aria-relevant="additions">
                {transcript.map(entry => (
                  <li key={entry.id} className={styles.message} data-role={entry.role}>
                    <div className={styles.messageMeta}>
                      <span className={styles.messageAuthor}>{entry.role === "aya" ? "Aya" : "You"}</span>
                      {entry.typed && <span className={styles.tag}>Topic</span>}
                      {entry.interrupted && <span className={styles.tag}>Interrupted</span>}
                      <time className={styles.messageTime} dateTime={new Date(entry.at).toISOString()}>
                        {formatClock(entry.at)}
                      </time>
                    </div>
                    <p className={styles.bubble}>
                      {entry.text.trim()}
                      {!entry.final && <span className={styles.caret} aria-hidden="true" />}
                    </p>
                  </li>
                ))}
              </ol>
            )
          ) : events.length === 0 ? (
            <EmptyState
              title="No activity yet"
              text="Connection, listening and reply events show up here as they happen."
            />
          ) : (
            <ol className={styles.timeline}>
              {[...events].reverse().map(event => (
                <li key={event.id} className={styles.event} data-tone={EVENT_TONE[event.kind]}>
                  <span className={styles.eventDot} aria-hidden="true" />
                  <div className={styles.eventBody}>
                    <span className={styles.eventLabel}>{event.label}</span>
                    {event.detail && <span className={styles.eventDetail}>{event.detail}</span>}
                  </div>
                  <time className={styles.eventTime} dateTime={new Date(event.at).toISOString()}>
                    {formatClock(event.at)}
                  </time>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </aside>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className={styles.empty}>
      <div className={styles.emptyIcon} aria-hidden="true">
        <ChatIcon size={22} />
      </div>
      <p className={styles.emptyTitle}>{title}</p>
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}
