"use client";

import { useState } from "react";
import { CloseIcon, FileTextIcon, UploadIcon } from "../../../../../components/icons";
import { ApiError } from "../../../../../lib/api/errors";
import { KNOWLEDGE_FILE_ACCEPT, fileTypeLabel, formatFileSize } from "../../../../../lib/knowledge/documents";
import ui from "../../../_components/ui.module.css";
import styles from "../knowledge.module.css";

/** File tile tinted by type (PDF / DOCX / TXT). */
export function FileTypeTile({ label, size = "md" }: { label: string; size?: "sm" | "md" }) {
  return (
    <span className={styles.fileTile} data-type={label} data-size={size} aria-hidden="true">
      <FileTextIcon size={size === "sm" ? 16 : 18} />
    </span>
  );
}

type FileDropzoneProps = {
  id: string;
  file: File | null;
  onSelect: (file: File | null) => void;
  error?: string;
  disabled?: boolean;
  /** Id of the hint/error paragraph below the field. */
  describedBy: string;
};

/**
 * Click-to-browse or drag-and-drop for one file. The real <input type="file"> stays in the
 * tab order (visually hidden), so keyboard and screen-reader users get the native picker.
 */
export function FileDropzone({ id, file, onSelect, error, disabled = false, describedBy }: FileDropzoneProps) {
  const [dragging, setDragging] = useState(false);

  if (file) {
    const label = fileTypeLabel({ file_name: file.name, mime_type: file.type });
    return (
      <div className={styles.selectedFile} data-invalid={Boolean(error)}>
        <FileTypeTile label={label} />
        <div className={styles.selectedFileText}>
          <strong title={file.name}>{file.name}</strong>
          <small>
            {label} · {formatFileSize(file.size)}
          </small>
        </div>
        <button type="button" className={ui.iconButton} onClick={() => onSelect(null)} disabled={disabled} aria-label={`Remove ${file.name}`} title="Choose a different file">
          <CloseIcon size={15} />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={id}
      className={styles.dropzone}
      data-dragging={dragging}
      data-invalid={Boolean(error)}
      data-disabled={disabled}
      onDragEnter={event => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={event => {
        event.preventDefault();
        event.dataTransfer.dropEffect = disabled ? "none" : "copy";
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        const dropped = event.dataTransfer.files?.[0];
        if (!disabled && dropped) onSelect(dropped);
      }}
    >
      <input
        id={id}
        type="file"
        className={styles.fileInput}
        accept={KNOWLEDGE_FILE_ACCEPT}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        onChange={event => {
          const picked = event.target.files?.[0];
          if (picked) onSelect(picked);
          event.target.value = "";
        }}
      />
      <span className={styles.dropIcon} aria-hidden="true">
        <UploadIcon size={20} />
      </span>
      <span className={styles.dropTitle}>
        Drop a file here or <span className={styles.browse}>browse</span>
      </span>
      <span className={styles.dropHint}>PDF, DOCX or TXT · up to 10 MB</span>
    </label>
  );
}

/**
 * Browser -> Next.js progress from XHR. At 100% the server is still forwarding the file to
 * AYABOT and Supabase Storage, so that phase is shown as indeterminate.
 */
export function UploadProgress({ fraction }: { fraction: number }) {
  const percent = Math.min(100, Math.round(fraction * 100));
  const sending = percent < 100;
  return (
    <div className={styles.progress}>
      <div className={styles.progressLabel} aria-live="polite">
        <span>{sending ? "Uploading file…" : "Saving to AYABOT…"}</span>
        {sending && <span>{percent}%</span>}
      </div>
      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label="Upload progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={sending ? percent : undefined}
        data-indeterminate={!sending}
      >
        <span style={{ width: sending ? `${percent}%` : undefined }} />
      </div>
    </div>
  );
}

/** Messages for upload/replace failures, by the status the route handler passed through. */
export function uploadErrorMessage(error: unknown, context: "upload" | "replace") {
  if (!(error instanceof ApiError)) return "Something went wrong. Check your connection and try again.";
  switch (error.status) {
    case 401:
    case 403:
      return "Your session has ended. Redirecting to sign in…";
    case 404:
      return context === "upload"
        ? "This product is inactive or no longer exists. Documents can only be added to active products."
        : "This document no longer exists. It may have been deleted.";
    case 413:
      return "This file is larger than the 10 MB limit.";
    case 409: // replace: already processing, or an earlier replacement still needs cleanup
    case 400:
    case 415:
    case 422:
    case 502:
      return error.message;
  }
  if (error.kind === "network") return error.message;
  return error.message || "The AYABOT server couldn't save the document. Please try again.";
}
