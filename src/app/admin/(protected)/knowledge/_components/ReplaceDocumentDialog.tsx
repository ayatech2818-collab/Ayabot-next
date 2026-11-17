"use client";

import { useRef, useState } from "react";
import { AlertIcon, FileUpIcon, InfoIcon } from "../../../../../components/icons";
import { apiUpload } from "../../../../../lib/api/browser";
import type { KnowledgeDocument } from "../../../../../lib/api/knowledge";
import { canReplace, fileTypeLabel, formatFileSize, validateKnowledgeFile } from "../../../../../lib/knowledge/documents";
import Modal from "../../../_components/Modal";
import { FileDropzone, FileTypeTile, UploadProgress, uploadErrorMessage } from "./FileDropzone";
import ui from "../../../_components/ui.module.css";
import styles from "../knowledge.module.css";

type ReplaceDocumentDialogProps = {
  document: KnowledgeDocument | null;
  onClose: () => void;
  onReplaced: (document: KnowledgeDocument) => void;
};

/** Uploads a new version of an existing document. The id and title are kept. */
export default function ReplaceDocumentDialog({ document, onClose, onReplaced }: ReplaceDocumentDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={Boolean(document)}
      onClose={onClose}
      busy={busy}
      icon={<FileUpIcon size={18} />}
      title="Replace document"
      description={document ? `Upload a new version of “${document.title}”.` : undefined}
    >
      {document && <ReplaceForm key={document.id} document={document} busy={busy} setBusy={setBusy} onCancel={onClose} onReplaced={onReplaced} />}
    </Modal>
  );
}

function ReplaceForm({
  document,
  busy,
  setBusy,
  onCancel,
  onReplaced,
}: {
  document: KnowledgeDocument;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onCancel: () => void;
  onReplaced: (document: KnowledgeDocument) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const submitting = useRef(false);
  // The list keeps polling while this is open; the backend would reject a busy document anyway.
  const blocked = !canReplace(document.status);
  const currentType = fileTypeLabel(document);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || blocked) return;

    const error = file ? validateKnowledgeFile(file) ?? undefined : "Choose the new file.";
    setFileError(error);
    if (error || !file) return;

    submitting.current = true;
    setBusy(true);
    setFormError(null);
    setProgress(0);

    const form = new FormData();
    form.append("file", file, file.name);

    try {
      const updated = await apiUpload<KnowledgeDocument>(`/api/knowledge/documents/${encodeURIComponent(document.id)}/replace`, form, {
        method: "PUT",
        onProgress: setProgress,
      });
      onReplaced(updated);
    } catch (uploadError) {
      setFormError(uploadErrorMessage(uploadError, "replace"));
      setProgress(null);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className={ui.formStack}>
      {formError && (
        <div className={ui.inlineError} role="alert">
          <AlertIcon size={16} />
          <span>{formError}</span>
        </div>
      )}

      <div className={styles.currentFile}>
        <span className={styles.currentFileLabel}>Current file</span>
        <div className={styles.selectedFile} data-variant="current">
          <FileTypeTile label={currentType} />
          <div className={styles.selectedFileText}>
            <strong title={document.file_name}>{document.file_name}</strong>
            <small>
              {currentType} · {formatFileSize(document.file_size)}
            </small>
          </div>
        </div>
      </div>

      <div className={ui.field}>
        <label htmlFor="knowledge-replace-file" className={ui.fieldLabel}>
          New file <span aria-hidden="true">*</span>
        </label>
        <FileDropzone
          id="knowledge-replace-file"
          file={file}
          onSelect={next => {
            setFile(next);
            setFormError(null);
            setFileError(next ? validateKnowledgeFile(next) ?? undefined : undefined);
          }}
          error={fileError}
          disabled={busy || blocked}
          describedBy="knowledge-replace-hint"
        />
        <p id="knowledge-replace-hint" className={fileError ? ui.fieldError : ui.fieldHint}>
          {fileError ?? "PDF, DOCX or TXT, up to 10 MB. The file type may differ from the current one."}
        </p>
      </div>

      <div className={styles.calloutInfo}>
        <InfoIcon size={16} />
        <p>
          {blocked
            ? "This document is being processed. Wait until it completes or fails before replacing it."
            : "Existing chunks keep answering questions until the new file finishes processing. If processing fails, the current version stays in place and you can retry."}
        </p>
      </div>

      {progress !== null && <UploadProgress fraction={progress} />}

      <div className={ui.formActions}>
        <button type="button" className={ui.secondaryButton} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={ui.primaryButton} disabled={busy || blocked} aria-busy={busy}>
          {busy ? <span className={ui.spinner} aria-hidden="true" /> : <FileUpIcon size={15} />}
          {busy ? "Replacing…" : "Replace file"}
        </button>
      </div>
    </form>
  );
}
