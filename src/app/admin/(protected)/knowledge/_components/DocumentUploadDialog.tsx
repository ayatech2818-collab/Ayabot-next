"use client";

import { useRef, useState } from "react";
import { AlertIcon, PackageIcon, UploadIcon } from "../../../../../components/icons";
import { apiUpload } from "../../../../../lib/api/browser";
import type { KnowledgeDocument } from "../../../../../lib/api/knowledge";
import {
  KNOWLEDGE_TITLE_MAX,
  titleFromFileName,
  validateKnowledgeFile,
  validateKnowledgeTitle,
} from "../../../../../lib/knowledge/documents";
import Modal from "../../../_components/Modal";
import { FileDropzone, UploadProgress, uploadErrorMessage } from "./FileDropzone";
import type { KnowledgeProduct } from "./KnowledgeManager";
import ui from "../../../_components/ui.module.css";
import styles from "../knowledge.module.css";

type DocumentUploadDialogProps = {
  open: boolean;
  product: KnowledgeProduct;
  onClose: () => void;
  onUploaded: (document: KnowledgeDocument) => void;
};

export default function DocumentUploadDialog({ open, product, onClose, onUploaded }: DocumentUploadDialogProps) {
  const [busy, setBusy] = useState(false);

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={busy}
      icon={<UploadIcon size={18} />}
      title="Upload document"
      description="AYABOT extracts, chunks and embeds the file in the background after it's uploaded."
    >
      {/* Mounted per open, so every upload starts from an empty form. */}
      {open && <UploadForm product={product} busy={busy} setBusy={setBusy} onCancel={onClose} onUploaded={onUploaded} />}
    </Modal>
  );
}

type FieldErrors = { title?: string; file?: string };

function UploadForm({
  product,
  busy,
  setBusy,
  onCancel,
  onUploaded,
}: {
  product: KnowledgeProduct;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onCancel: () => void;
  onUploaded: (document: KnowledgeDocument) => void;
}) {
  const [title, setTitle] = useState("");
  // Until the admin types a title, picking a file suggests one from its name.
  const [titleEdited, setTitleEdited] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const submitting = useRef(false);

  const selectFile = (next: File | null) => {
    setFile(next);
    setFormError(null);
    setErrors(current => ({ ...current, file: next ? validateKnowledgeFile(next) ?? undefined : undefined }));
    if (next && !titleEdited) {
      const suggested = titleFromFileName(next.name);
      setTitle(suggested);
      setErrors(current => ({ ...current, title: current.title ? validateKnowledgeTitle(suggested) ?? undefined : undefined }));
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;

    const found: FieldErrors = {
      title: validateKnowledgeTitle(title) ?? undefined,
      file: file ? validateKnowledgeFile(file) ?? undefined : "Choose a file to upload.",
    };
    setErrors(found);
    if (found.title || found.file || !file) return;

    submitting.current = true;
    setBusy(true);
    setFormError(null);
    setProgress(0);

    const form = new FormData();
    form.append("product_id", product.id);
    form.append("title", title.trim());
    form.append("file", file, file.name);

    try {
      const created = await apiUpload<KnowledgeDocument>("/api/knowledge/documents", form, { onProgress: setProgress });
      onUploaded(created);
    } catch (error) {
      setFormError(uploadErrorMessage(error, "upload"));
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

      <div className={styles.productContext}>
        <PackageIcon size={16} />
        <span>
          Adding to <strong>{product.name}</strong>
        </span>
        <code>/{product.slug}</code>
      </div>

      <div className={ui.field}>
        <label htmlFor="knowledge-file" className={ui.fieldLabel}>
          File <span aria-hidden="true">*</span>
        </label>
        <FileDropzone id="knowledge-file" file={file} onSelect={selectFile} error={errors.file} disabled={busy} describedBy="knowledge-file-hint" />
        <p id="knowledge-file-hint" className={errors.file ? ui.fieldError : ui.fieldHint}>
          {errors.file ?? "Supported formats: PDF, DOCX and TXT. Maximum size 10 MB."}
        </p>
      </div>

      <div className={ui.field}>
        <div className={ui.fieldLabelRow}>
          <label htmlFor="knowledge-title" className={ui.fieldLabel}>
            Document title <span aria-hidden="true">*</span>
          </label>
          <span className={ui.counter} data-over={title.trim().length > KNOWLEDGE_TITLE_MAX}>
            {title.trim().length}/{KNOWLEDGE_TITLE_MAX}
          </span>
        </div>
        <input
          id="knowledge-title"
          className={ui.textInput}
          value={title}
          onChange={event => {
            setTitle(event.target.value);
            setTitleEdited(true);
            setFormError(null);
            if (errors.title) setErrors(current => ({ ...current, title: validateKnowledgeTitle(event.target.value) ?? undefined }));
          }}
          onBlur={() => title && setErrors(current => ({ ...current, title: validateKnowledgeTitle(title) ?? undefined }))}
          placeholder="e.g. Student management guide"
          maxLength={KNOWLEDGE_TITLE_MAX + 20}
          autoComplete="off"
          disabled={busy}
          aria-invalid={Boolean(errors.title)}
          aria-describedby="knowledge-title-hint"
        />
        <p id="knowledge-title-hint" className={errors.title ? ui.fieldError : ui.fieldHint}>
          {errors.title ?? "Shown in the document list so admins can recognise it."}
        </p>
      </div>

      {progress !== null && <UploadProgress fraction={progress} />}

      <div className={ui.formActions}>
        <button type="button" className={ui.secondaryButton} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={ui.primaryButton} disabled={busy} aria-busy={busy}>
          {busy ? <span className={ui.spinner} aria-hidden="true" /> : <UploadIcon size={15} />}
          {busy ? "Uploading…" : "Upload document"}
        </button>
      </div>
    </form>
  );
}
