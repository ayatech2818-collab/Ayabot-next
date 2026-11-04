"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "../../../../../components/icons";
import styles from "../products.module.css";

const dateFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });
const dateTimeFormat = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

export const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
};
export const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTimeFormat.format(date);
};

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span className={styles.status} data-active={active}>
      {active ? "Active" : "Inactive"}
    </span>
  );
}

/** Two-letter monogram tile, tinted deterministically from the slug. */
export function ProductMark({ name, slug, size = "md" }: { name: string; slug: string; size?: "md" | "lg" }) {
  const initials = name
    .split(/\s+/)
    .map(word => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const hue = [...slug].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;

  return (
    <span className={styles.mark} data-size={size} style={{ "--mark-hue": hue } as React.CSSProperties} aria-hidden="true">
      {initials || "?"}
    </span>
  );
}

export function SlugChip({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(slug);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (e.g. insecure context); the slug is still visible to select.
    }
  };

  return (
    <span className={styles.slug}>
      <code>/{slug}</code>
      <button type="button" onClick={copy} aria-label={copied ? "Slug copied" : `Copy slug ${slug}`} title="Copy slug">
        {copied ? <CheckIcon size={13} strokeWidth={2.4} /> : <CopyIcon size={13} />}
      </button>
    </span>
  );
}
