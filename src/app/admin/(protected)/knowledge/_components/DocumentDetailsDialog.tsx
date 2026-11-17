"use client";

import { AlertIcon, FileTextIcon, FileUpIcon, ResetIcon, TrashIcon } from "../../../../../components/icons";
import type { KnowledgeDocument, KnowledgeDocumentDetail, KnowledgeDocumentStatus } from "../../../../../lib/api/knowledge";
import { canReplace, canReprocess, canRetry, fileTypeLabel, formatFileSize, isInProgress } from "../../../../../lib/knowledge/documents";
import Modal from "../../../_components/Modal";
import { formatDateTime } from "../../products/_components/ProductBits";
import DocumentStatusBadge from "./DocumentStatusBadge";
import { FileTypeTile } from "./FileDropzone";
import ui from "../../../_components/ui.module.css";
import styles from "../knowledge.module.css";

const STATUS_COPY: Record<KnowledgeDocumentStatus, string> = {
  pending: "Waiting for background processing to start.",
  processing: "Extracting text, splitting it into chunks and generating embeddings.",
  completed: "Processed. Its chunks are available to AYABOT for knowledge retrieval.",
  failed: "Processing didn't finish. Retry it, or replace the file if it can't be read.",
};

type DocumentDetailsDialogProps = {
  document: KnowledgeDocument | null;
  productName: string;
  detail?: KnowledgeDocumentDetail;
  detailError?: string;
  /** True when the loaded detail is older than the document's latest status. */
  detailStale: boolean;
  stuck: boolean;
  busy: boolean;
  onClose: () => void;
  onReloadDetail: (document: KnowledgeDocument) => void;
  onRetry: (document: KnowledgeDocument) => void;
  onReprocess: (document: KnowledgeDocument) => void;
  onReplace: (document: KnowledgeDocument) => void;
  onDelete: (document: KnowledgeDocument) => void;
};

/** Read-only view of one document with chunk statistics from GET /knowledge/documents/{id}. */
export default function DocumentDetailsDialog({
  document,
  productName,
  detail,
  detailError,
  detailStale,
  stuck,
  busy,
  onClose,
  onReloadDetail,
  onRetry,
  onReprocess,
  onReplace,
  onDelete,
}: DocumentDetailsDialogProps) {
  const type = document ? fileTypeLabel(document) : "";

  return (
    <Modal
      open={Boolean(document)}
      onClose={onClose}
      icon={<FileTextIcon size={18} />}
      title={document?.title ?? "Document"}
      description={document ? `${productName} · ${document.file_name}` : undefined}
      footer={
        document && (
          <>
            <button type="button" className={ui.dangerOutlineButton} onClick={() => onDelete(document)} disabled={busy}>
              <TrashIcon size={14} />
              Delete
            </button>
            <span className={styles.footerSpacer} aria-hidden="true" />
            {canRetry(document.status) && (
              <button type="button" className={ui.secondaryButton} onClick={() => onRetry(document)} disabled={busy} aria-busy={busy}>
                {busy ? <span className={ui.spinner} aria-hidden="true" /> : <ResetIcon size={14} />}
                Retry
              </button>
            )}
            {canReprocess(document.status) && (
              <button type="button" className={ui.secondaryButton} onClick={() => onReprocess(document)} disabled={busy} aria-busy={busy}>
                {busy ? <span className={ui.spinner} aria-hidden="true" /> : <ResetIcon size={14} />}
                Reprocess
              </button>
            )}
            <button
              type="button"
              className={ui.secondaryButton}
              onClick={() => onReplace(document)}
              disabled={busy || !canReplace(document.status)}
              title={canReplace(document.status) ? undefined : "Available once processing completes or fails"}
            >
              <FileUpIcon size={14} />
              Replace
            </button>
            <button type="button" className={ui.primaryButton} onClick={onClose}>
              Close
            </button>
          </>
        )
      }
    >
      {document && (
        <div className={styles.detailStack}>
          <div className={styles.detailStatus} data-status={document.status}>
            <DocumentStatusBadge status={document.status} />
            <p>{STATUS_COPY[document.status] ?? ""}</p>
            {stuck && (
              <p className={styles.stuckNote}>
                {document.status === "pending"
                  ? "This has been waiting longer than expected. If the AYABOT server restarted, retry processing."
                  : "This is taking unusually long. If the AYABOT server restarted, processing may have stopped; the backend doesn't allow retrying a processing document, so delete and re-upload it if it stays stuck."}
              </p>
            )}
          </div>

          {document.error_message && (
            <div className={styles.errorBox} role="note">
              <span>
                <AlertIcon size={15} />
                Processing error
              </span>
              <pre>{document.error_message}</pre>
            </div>
          )}

          <section aria-labelledby="chunk-stats-title">
            <div className={styles.detailSectionHead}>
              <h3 id="chunk-stats-title">Chunks</h3>
              {detail && detailStale && <span className={ui.spinner} aria-label="Refreshing chunk statistics" />}
            </div>
            {detail ? (
              <ChunkStats detail={detail} inProgress={isInProgress(document.status)} />
            ) : detailError ? (
              <p className={styles.detailMuted}>
                {detailError}{" "}
                <button type="button" className={ui.textButton} onClick={() => onReloadDetail(document)}>
                  Try again
                </button>
              </p>
            ) : (
              <div className={styles.chunkStats} aria-busy="true" aria-label="Loading chunk statistics">
                <span className={styles.skeletonTile} />
                <span className={styles.skeletonTile} />
              </div>
            )}
          </section>

          <dl className={styles.detailList}>
            <div>
              <dt>File</dt>
              <dd className={styles.detailFile}>
                <FileTypeTile label={type} size="sm" />
                <span>{document.file_name}</span>
              </dd>
            </div>
            <div>
              <dt>Type &amp; size</dt>
              <dd>
                {type} · {formatFileSize(document.file_size)}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>
                <time dateTime={document.created_at} suppressHydrationWarning>
                  {formatDateTime(document.created_at)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Last updated</dt>
              <dd>
                <time dateTime={document.updated_at} suppressHydrationWarning>
                  {formatDateTime(document.updated_at)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Document ID</dt>
              <dd>
                <code className={styles.idCode}>{document.id}</code>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Modal>
  );
}

function ChunkStats({ detail, inProgress }: { detail: KnowledgeDocumentDetail; inProgress: boolean }) {
  const { total_chunks: total, embedded_chunks: embedded } = detail;
  const percent = total ? Math.round((embedded / total) * 100) : 0;

  return (
    <>
      <div className={styles.chunkStats}>
        <div className={styles.chunkStat}>
          <span>Total chunks</span>
          <strong>{total.toLocaleString("en-IN")}</strong>
        </div>
        <div className={styles.chunkStat} data-tone={total && embedded < total ? "warning" : undefined}>
          <span>Embedded</span>
          <strong>{embedded.toLocaleString("en-IN")}</strong>
        </div>
      </div>
      {total > 0 && (
        <div className={styles.embedBar} role="img" aria-label={`${percent}% of chunks embedded`}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      <p className={styles.detailMuted}>
        {inProgress
          ? total
            ? "These are the chunks currently in use. They're replaced once the new processing run succeeds."
            : "Chunks appear here once processing completes."
          : total === 0
            ? "No chunks are stored for this document."
            : embedded < total
              ? `${(total - embedded).toLocaleString("en-IN")} chunk${total - embedded === 1 ? " has" : "s have"} no embedding and can't be retrieved.`
              : "Every chunk has an embedding and can be retrieved."}
      </p>
    </>
  );
}
