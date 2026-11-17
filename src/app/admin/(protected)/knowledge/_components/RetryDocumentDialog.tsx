"use client";

import { useTransition } from "react";
import { ResetIcon } from "../../../../../components/icons";
import type { KnowledgeDocument } from "../../../../../lib/api/knowledge";
import Modal from "../../../_components/Modal";
import ui from "../../../_components/ui.module.css";

type RetryDocumentDialogProps = {
  document: KnowledgeDocument | null;
  onClose: () => void;
  /** Runs the retry; resolves once the result has been handled (toast, list update). */
  onConfirm: (document: KnowledgeDocument) => Promise<void>;
};

/**
 * Retrying a `failed` document needs no confirmation. A `pending` one may still be queued in
 * FastAPI's in-process BackgroundTasks, and retrying it then would process it twice - so the
 * admin confirms it's actually stuck (e.g. the server restarted before processing began).
 */
export default function RetryDocumentDialog({ document, onClose, onConfirm }: RetryDocumentDialogProps) {
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    if (!document || pending) return;
    startTransition(async () => {
      await onConfirm(document);
      onClose();
    });
  };

  return (
    <Modal
      open={Boolean(document)}
      onClose={onClose}
      busy={pending}
      size="sm"
      icon={<ResetIcon size={18} />}
      title="Retry pending document?"
      footer={
        <>
          <button type="button" className={ui.secondaryButton} onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={ui.primaryButton} onClick={confirm} disabled={pending} aria-busy={pending} autoFocus>
            {pending ? <span className={ui.spinner} aria-hidden="true" /> : <ResetIcon size={15} />}
            {pending ? "Retrying…" : "Retry processing"}
          </button>
        </>
      }
    >
      {document && (
        <p className={ui.modalCopy}>
          <strong>{document.title}</strong> is still waiting to be processed. Retry only if it seems stuck — for example,
          after the AYABOT server restarted. If it&apos;s still queued, retrying can process it twice.
        </p>
      )}
    </Modal>
  );
}
