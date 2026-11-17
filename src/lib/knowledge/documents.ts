// Knowledge document rules shared by the upload route handlers and the admin UI. Keep this free
// of server-only imports (types are erased, so importing them is fine).
import type { KnowledgeDocument, KnowledgeDocumentStatus } from "../api/knowledge";

/** Matches MAX_FILE_SIZE in ayabot-backend/app/api/routes/knowledge.py (10 MiB). */
export const KNOWLEDGE_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** The title column is VARCHAR(255). */
export const KNOWLEDGE_TITLE_MAX = 255;

/** Multipart overhead allowance on top of the file itself (field names, boundaries, title). */
export const KNOWLEDGE_MAX_REQUEST_BYTES = KNOWLEDGE_MAX_FILE_BYTES + 64 * 1024;

export const KNOWLEDGE_FILE_TYPES = {
  ".pdf": { label: "PDF", mime: "application/pdf" },
  ".docx": { label: "DOCX", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  ".txt": { label: "TXT", mime: "text/plain" },
} as const;

export type KnowledgeFileExtension = keyof typeof KNOWLEDGE_FILE_TYPES;

/** For the file input's `accept` attribute: extensions plus MIME types. */
export const KNOWLEDGE_FILE_ACCEPT = Object.entries(KNOWLEDGE_FILE_TYPES)
  .flatMap(([extension, { mime }]) => [extension, mime])
  .join(",");

export function fileExtension(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot).toLowerCase() : "";
}

function isSupportedExtension(extension: string): extension is KnowledgeFileExtension {
  return Object.hasOwn(KNOWLEDGE_FILE_TYPES, extension);
}

/** PDF / DOCX / TXT, from the file name first and the MIME type as a fallback. */
export function fileTypeLabel(document: Pick<KnowledgeDocument, "file_name" | "mime_type">): string {
  const extension = fileExtension(document.file_name);
  if (isSupportedExtension(extension)) return KNOWLEDGE_FILE_TYPES[extension].label;
  const byMime = Object.values(KNOWLEDGE_FILE_TYPES).find(type => type.mime === document.mime_type);
  return byMime?.label ?? (extension.replace(".", "").toUpperCase() || "File");
}

/** Same checks the backend makes, so most problems surface before any bytes are sent. */
export function validateKnowledgeFile(file: { name: string; size: number }): string | null {
  if (!isSupportedExtension(fileExtension(file.name))) return "Only PDF, DOCX and TXT files are supported.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > KNOWLEDGE_MAX_FILE_BYTES) return `This file is ${formatFileSize(file.size)}. The maximum size is 10 MB.`;
  return null;
}

export function validateKnowledgeTitle(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return "Enter a title for this document.";
  if (trimmed.length > KNOWLEDGE_TITLE_MAX) return `Keep the title to ${KNOWLEDGE_TITLE_MAX} characters or fewer.`;
  return null;
}

/** A readable default title from a file name: "student-management_v2.pdf" -> "Student management v2". */
export function titleFromFileName(fileName: string): string {
  const base = (fileName.split(/[\\/]/).pop() ?? "").replace(/\.[^.]+$/, "");
  const words = base.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, KNOWLEDGE_TITLE_MAX);
}

const sizeFormat = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 });

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

/** Waiting for, or in the middle of, background processing. */
export function isInProgress(status: KnowledgeDocumentStatus) {
  return status === "pending" || status === "processing";
}

/** The backend's retry endpoint accepts these and rejects everything else. */
export function canRetry(status: KnowledgeDocumentStatus) {
  return status === "failed" || status === "pending";
}

/** Reprocessing is available only when no processing run is currently active. */
export function canReprocess(status: KnowledgeDocumentStatus) {
  return status === "completed" || status === "failed";
}

/** The backend rejects a replacement while the document is pending or processing. */
export function canReplace(status: KnowledgeDocumentStatus) {
  return !isInProgress(status);
}

export const STATUS_LABELS: Record<KnowledgeDocumentStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  failed: "Failed",
};

/**
 * Processing runs in FastAPI BackgroundTasks, so a server restart can leave a document waiting
 * forever. After these thresholds the UI suggests that the document may be stuck.
 */
export const STUCK_PENDING_MS = 2 * 60_000;
export const STUCK_PROCESSING_MS = 15 * 60_000;

export function isLikelyStuck(document: Pick<KnowledgeDocument, "status" | "updated_at">, now: number) {
  const updated = new Date(document.updated_at).getTime();
  if (Number.isNaN(updated)) return false;
  if (document.status === "pending") return now - updated > STUCK_PENDING_MS;
  if (document.status === "processing") return now - updated > STUCK_PROCESSING_MS;
  return false;
}
